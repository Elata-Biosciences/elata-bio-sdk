#!/usr/bin/env python3
"""Train a lightweight tabular classifier to choose between PSD-selected BPM and cepstrum BPM.

Usage:
  python3 scripts/train_tabular_hr_classifier.py /path/to/log1.csv /path/to/log2.csv
  python3 scripts/train_tabular_hr_classifier.py --auto-label --min-bpm 55

If no args are given, looks for CSVs in ~/Downloads starting with "rppg-debug-log".

Outputs metrics and a small joblib model file `models/hr_tabular_rf.joblib` (if sklearn available).
"""
import argparse
import sys, os, csv, json, math, random
from glob import glob
from statistics import median

CSV_GLOB_DEFAULT = os.path.expanduser('~/Downloads/rppg-debug-log*.csv')


def harmonic_support_from_candidates(candidates, cep_bpm):
    if cep_bpm is None: return 0.0
    cep_hz = cep_bpm / 60.0
    s = 0.0
    for c in candidates:
        f = c.get('f')
        p = c.get('p', 0.0)
        if f is None: continue
        rel = abs(f - cep_hz) / max(cep_hz, 1e-6)
        if rel < 0.08: s += p
        rel_sub = abs(f - cep_hz * 0.5) / max(cep_hz * 0.5, 1e-6)
        rel_h = abs(f - (cep_hz * 2.0)) / max(cep_hz * 2.0, 1e-6)
        if rel_sub < 0.08 or rel_h < 0.08:
            s += p * 0.8
    return s


def _parse_malformed_line(line):
    # tolerant parser for lines where CSV quoting broke due to commas inside `candidates` JSON
    # Expected columns: ts,selected,reason,cep_bpm,cep_conf,acf_f,acf_score,candidates,manual_bpm,manual_count,manual_elapsed
    parts = line.rstrip('\n').split(',', 7)
    if len(parts) < 8:
        return None
    head = parts[:7]
    rest = parts[7]
    # find the candidates JSON (first '[' to matching ']')
    start = rest.find('[')
    if start == -1:
        # fallback: no candidates
        candidates_str = ''
        tail = rest
    else:
        i = start
        level = 0
        end = -1
        while i < len(rest):
            c = rest[i]
            if c == '[':
                level += 1
            elif c == ']':
                level -= 1
                if level == 0:
                    end = i
                    break
            i += 1
        if end == -1:
            candidates_str = rest[start:]
            tail = ''
        else:
            candidates_str = rest[start:end+1]
            tail = rest[end+1:]
    # clean and parse candidates
    candidates = []
    if candidates_str:
        try:
            # remove stray escaping that can appear in logs
            cleaned = candidates_str.replace('\\"', '"')
            candidates = json.loads(cleaned)
        except Exception:
            # try a brute-force approach: extract numbers
            candidates = []
    # parse tail for manual fields
    tail = tail.lstrip(',')
    tail_parts = [t for t in tail.split(',') if t != '']
    manual_bpm = None
    manual_count = None
    manual_elapsed = None
    if len(tail_parts) >= 1:
        try: manual_bpm = float(tail_parts[0])
        except: manual_bpm = None
    if len(tail_parts) >= 2:
        try: manual_count = float(tail_parts[1])
        except: manual_count = None
    if len(tail_parts) >= 3:
        try: manual_elapsed = float(tail_parts[2])
        except: manual_elapsed = None
    # assemble dict matching DictReader keys
    return {
        'ts': head[0],
        'selected': head[1],
        'reason': head[2],
        'cep_bpm': head[3],
        'cep_conf': head[4],
        'acf_f': head[5],
        'acf_score': head[6],
        'candidates': candidates,
        'manual_bpm': manual_bpm,
        'manual_count': manual_count,
        'manual_elapsed': manual_elapsed,
    }


def _safe_float(val):
    try:
        f = float(val)
        if math.isnan(f):
            return None
        return f
    except Exception:
        return None


def _normalize_candidates(candidates):
    if not candidates:
        return []
    cleaned = []
    for c in candidates:
        if not isinstance(c, dict):
            continue
        f = c.get('f')
        p = c.get('p', 0.0)
        if f is None:
            continue
        cleaned.append({'f': f, 'p': p})
    cleaned.sort(key=lambda x: x.get('p', 0.0), reverse=True)
    return cleaned


def load_rows(paths):
    rows = []
    for p in paths:
        file_rows = []
        # first attempt: use csv.DictReader
        with open(p, 'r', newline='') as fh:
            reader = csv.DictReader(fh)
            for r in reader:
                # parse numeric fields
                r['selected'] = _safe_float(r.get('selected') or 'nan')
                r['cep_bpm'] = _safe_float(r.get('cep_bpm') or 'nan')
                r['cep_conf'] = _safe_float(r.get('cep_conf') or 'nan')
                r['acf_score'] = _safe_float(r.get('acf_score') or 'nan')
                # manual taps fields (added by demo)
                r['manual_bpm'] = _safe_float(r.get('manual_bpm') or 'nan')
                r['manual_count'] = _safe_float(r.get('manual_count') or 'nan')
                r['manual_elapsed'] = _safe_float(r.get('manual_elapsed') or 'nan')
                # parse candidates JSON
                try:
                    r['candidates'] = _normalize_candidates(json.loads(r.get('candidates') or '[]'))
                except Exception:
                    r['candidates'] = []
                r['_source'] = p
                file_rows.append(r)
        # quick check: do we have any parsed manual_bpm floats? if not, try tolerant parsing
        num_manual = sum(1 for r in file_rows if r.get('manual_bpm') is not None)
        num_candidates = sum(1 for r in file_rows if r.get('candidates'))
        needs_fallback = False
        if num_manual == 0 and num_candidates == 0:
            try:
                with open(p, 'r', errors='ignore') as fh:
                    if '[' in fh.read():
                        needs_fallback = True
            except Exception:
                needs_fallback = True
        if needs_fallback:
            # fallback: robust parsing for broken CSVs where rows may be split across physical lines
            file_rows = []
            with open(p, 'r', errors='ignore') as fh:
                header = fh.readline()
                data = fh.read()
            # scan through data and attempt to greedily extract records by finding a bracketed candidates JSON
            i = 0
            n = len(data)
            while i < n:
                # attempt to find a record by looking for a '[' and its matching ']' after a reasonable header
                start_idx = data.find('[', i)
                if start_idx == -1:
                    break
                # find matching closing bracket
                j = start_idx
                level = 0
                end_idx = -1
                while j < n:
                    if data[j] == '[':
                        level += 1
                    elif data[j] == ']':
                        level -= 1
                        if level == 0:
                            end_idx = j
                            break
                    j += 1
                if end_idx == -1:
                    # incomplete, stop
                    break
                # find start of this line by searching backwards for a newline
                line_start = data.rfind('\n', 0, start_idx)
                line_start = 0 if line_start == -1 else line_start+1
                # compute tail after the JSON
                tail_start = end_idx+1
                # grab up to next newline to include manual fields
                next_nl = data.find('\n', tail_start)
                line_end = next_nl if next_nl != -1 else n
                line = data[line_start:line_end]
                parsed = _parse_malformed_line(line)
                if not parsed:
                    # advance past end_idx to avoid infinite loop
                    i = end_idx + 1
                    continue
                # convert numeric fields
                parsed['selected'] = _safe_float(parsed.get('selected'))
                parsed['cep_bpm'] = _safe_float(parsed.get('cep_bpm'))
                parsed['cep_conf'] = _safe_float(parsed.get('cep_conf'))
                parsed['acf_score'] = _safe_float(parsed.get('acf_score'))
                parsed['candidates'] = _normalize_candidates(parsed.get('candidates') or [])
                parsed['_source'] = p
                file_rows.append(parsed)
                i = line_end + 1
        rows.extend(file_rows)
    return rows


def auto_label_from_candidates(row, min_bpm=55.0):
    candidates = row.get('candidates', [])
    best = None
    best_score = -1.0
    for cand in candidates:
        f = cand.get('f')
        if f is None:
            continue
        bpm = f * 60.0
        if bpm < min_bpm:
            continue
        score = cand.get('p', 0.0)
        if score > best_score:
            best_score = score
            best = bpm
    return best


def assign_auto_labels(rows, min_bpm=55.0):
    count = 0
    for row in rows:
        manual = row.get('manual_bpm')
        if manual is not None and not math.isnan(manual):
            continue
        bpm = auto_label_from_candidates(row, min_bpm)
        if bpm is not None:
            row['_auto_label_bpm'] = bpm
            count += 1
    return count


def build_dataset(rows):
    X = []
    y = []
    last_selected = None
    last_source = None
    for r in rows:
        if last_source is None or r.get('_source') != last_source:
            last_selected = None
            last_source = r.get('_source')
        manual = r.get('manual_bpm')
        auto_label = r.get('_auto_label_bpm')
        label_bpm = None
        if manual is not None and not math.isnan(manual):
            label_bpm = manual
        elif auto_label is not None:
            label_bpm = auto_label
        if label_bpm is None:
            last_selected = r.get('selected')
            continue
        sel = r.get('selected')
        cep = r.get('cep_bpm')
        cep_conf = r.get('cep_conf') or 0.0
        acf = r.get('acf_score') or 0.0
        # harmonic support
        hs = harmonic_support_from_candidates(r.get('candidates', []), cep)
        # top power and second power
        ps = [c.get('p', 0.0) for c in r.get('candidates', [])]
        peak = ps[0] if len(ps) > 0 else 0.0
        second = ps[1] if len(ps) > 1 else 0.0
        median_p = median(ps) if ps else 0.0
        p_ratio = peak / (median_p + 1e-12)
        peak_vs_second = peak / (second + 1e-12)
        # delta to last selected
        delta_prev = abs(sel - last_selected) if (sel is not None and last_selected is not None) else 0.0
        # label: 1 if cepstrum closer to manual/auto label than selected (improvement)
        if cep is None or sel is None:
            last_selected = sel
            continue
        diff_sel = abs(label_bpm - sel)
        diff_cep = abs(label_bpm - cep)
        # require an improvement margin (>=1 bpm) to avoid noisy ties
        label = 1 if diff_cep + 1e-6 < diff_sel - 1.0 else 0
        feats = {
            'cep_conf': cep_conf,
            'acf_score': acf,
            'harmonic_support': hs,
            'peak_p': peak,
            'peak_ratio': p_ratio,
            'peak_vs_second': peak_vs_second,
            'delta_prev': delta_prev,
            'selected': sel,
            'cep_bpm': cep
        }
        X.append(feats)
        y.append(label)
        last_selected = sel
    return X, y


def _split_sources(rows, seed=1, train_frac=0.8):
    sources = sorted({r.get('_source') for r in rows if r.get('_source')})
    if not sources:
        return rows, []
    rng = random.Random(seed)
    rng.shuffle(sources)
    cut = max(1, int(len(sources) * train_frac))
    train_sources = set(sources[:cut])
    train_rows = [r for r in rows if r.get('_source') in train_sources]
    val_rows = [r for r in rows if r.get('_source') not in train_sources]
    return train_rows, val_rows


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train or apply a tabular HR classifier.')
    parser.add_argument('paths', nargs='*', help='CSV log files to train on')
    parser.add_argument('--auto-label', action='store_true', help='Automatically label rows using heuristics (min BPM threshold)')
    parser.add_argument('--min-bpm', type=float, default=55.0, help='Minimum BPM to consider when auto-labeling')
    parser.add_argument('--apply', nargs='*', help='CSV files to annotate with model predictions after training')
    parser.add_argument('--model', choices=['rf', 'logreg'], default='rf', help='Model type to train')
    args = parser.parse_args()

    paths = args.paths if args.paths else glob(CSV_GLOB_DEFAULT)
    if not paths:
        print('No CSV logs found. Provide CSV paths as args or place logs in ~/Downloads with prefix rppg-debug-log')
        sys.exit(1)

    rows = load_rows(paths)
    if args.auto_label:
        auto_count = assign_auto_labels(rows, args.min_bpm)
        print(f'Auto-label applied to {auto_count} rows (min bpm {args.min_bpm})')
    num_manual = sum(1 for r in rows if r.get('manual_bpm') is not None)
    print(f'Loaded {len(rows)} rows, manual_bpm present in {num_manual} rows')
    train_rows, val_rows = _split_sources(rows)
    Xdict, y = build_dataset(train_rows)
    if not Xdict:
        print('No labeled rows (manual_bpm or auto-label) found in provided logs.')
        sys.exit(1)
    Xdict_val, y_val = build_dataset(val_rows) if val_rows else ([], [])

    # convert to matrix
    import numpy as np
    keys = ['cep_conf','harmonic_support','acf_score','peak_p','peak_ratio','peak_vs_second','delta_prev','selected','cep_bpm']
    X = np.array([[d[k] for k in keys] for d in Xdict], dtype=float)
    y = np.array(y, dtype=int)

    print('Training dataset size:', X.shape, 'labels distribution:', {0:int((y==0).sum()),1:int((y==1).sum())})
    if Xdict_val:
        X_val = np.array([[d[k] for k in keys] for d in Xdict_val], dtype=float)
        y_val = np.array(y_val, dtype=int)
        print('Validation dataset size:', X_val.shape, 'labels distribution:', {0:int((y_val==0).sum()),1:int((y_val==1).sum())})

    # try sklearn models
    try:
        from sklearn.model_selection import cross_val_score, StratifiedKFold
        from sklearn.linear_model import LogisticRegression
        from sklearn.ensemble import RandomForestClassifier
        from sklearn.metrics import classification_report, confusion_matrix
    except Exception as e:
        print('scikit-learn not available:', e)
        print('Install scikit-learn to run training: pip install scikit-learn')
        sys.exit(1)

    skf = StratifiedKFold(n_splits=5, shuffle=True, random_state=1)
    log = LogisticRegression(max_iter=2000, C=0.3, class_weight='balanced')
    rf = RandomForestClassifier(n_estimators=200, random_state=1)

    print('\nCross-validating LogisticRegression...')
    cv_scores = cross_val_score(log, X, y, cv=skf, scoring='f1')
    print('F1 CV:', cv_scores.mean(), cv_scores)

    print('\nCross-validating RandomForest...')
    cv_scores = cross_val_score(rf, X, y, cv=skf, scoring='f1')
    print('F1 CV:', cv_scores.mean(), cv_scores)

    model = log if args.model == 'logreg' else rf
    model_name = 'logreg' if args.model == 'logreg' else 'rf'
    model.fit(X, y)
    if args.model == 'rf':
        importances = model.feature_importances_
        print('\nFeature importances:')
        for k, imp in sorted(zip(keys, importances), key=lambda x: -x[1]):
            print(f'  {k}: {imp:.3f}')
    else:
        coefs = model.coef_[0]
        intercept = model.intercept_[0]
        print('\nLogisticRegression coefficients:')
        for k, c in sorted(zip(keys, coefs), key=lambda x: -abs(x[1])):
            print(f'  {k}: {c:.4f}')
        print(f'  intercept: {intercept:.4f}')

    # evaluate (prefer validation set if available)
    if Xdict_val:
        y_pred = model.predict(X_val)
        print('\nValidation classification report:')
        print(classification_report(y_val, y_pred))
        print('Confusion matrix:')
        print(confusion_matrix(y_val, y_pred))
    else:
        y_pred = model.predict(X)
        print('\nTraining classification report:')
        print(classification_report(y, y_pred))
        print('Confusion matrix:')
        print(confusion_matrix(y, y_pred))

    # compute how many errors would be corrected by selecting cep when model predicts 1
    eval_dict = Xdict_val if Xdict_val else Xdict
    eval_y = y_val if Xdict_val else y
    eval_X = X_val if Xdict_val else X
    preds = model.predict(eval_X)
    corrected = sum(1 for gt,pred in zip(eval_y, preds) if gt==1 and pred==1)
    worsened = sum(1 for gt,pred in zip(eval_y, preds) if gt==0 and pred==1)
    print(f'Windows where cep was correct (label==1): {sum(eval_y)}, model recovers {corrected}, worsened {worsened} cases')

    # measure average improvement when model picks cep
    improvements = []
    worsens = []
    for d, gt, pred in zip(eval_dict, eval_y, preds):
        if pred == 1:
            if gt == 1:
                improvements.append(1)
            else:
                worsens.append(1)
    if improvements or worsens:
        print(f'Model picks cep: {len(improvements)} correct picks, {len(worsens)} incorrect picks')

    # persist model
    try:
        import joblib
        os.makedirs('models', exist_ok=True)
        out_path = f'models/hr_tabular_{model_name}.joblib'
        joblib.dump({'model': model, 'keys': keys}, out_path)
        print(f'Model saved to {out_path}')
    except Exception as e:
        print('joblib not available or save failed:', e)

    if args.apply:
        print('\nApplying model to files:', args.apply)
        try:
            mobj = {'model': model, 'keys': keys}
            for fpath in args.apply:
                outp = fpath + '.with_model.csv'
                with open(fpath, 'r') as inf, open(outp, 'w', newline='') as outf:
                    reader = csv.DictReader(inf)
                    fieldnames = list(reader.fieldnames) + ['model_predict_cep', 'corrected_bpm']
                    writer = csv.DictWriter(outf, fieldnames=fieldnames)
                    writer.writeheader()
                    for r in reader:
                        # build features for row
                        cep = _safe_float(r.get('cep_bpm') or 'nan')
                        sel = _safe_float(r.get('selected') or 'nan')
                        cep_conf = _safe_float(r.get('cep_conf') or 'nan') or 0.0
                        acf = _safe_float(r.get('acf_score') or 'nan') or 0.0
                        try:
                            candidates = _normalize_candidates(json.loads(r.get('candidates') or '[]'))
                        except:
                            candidates = []
                        hs = harmonic_support_from_candidates(candidates, cep)
                        ps = [c.get('p', 0.0) for c in candidates]
                        peak = ps[0] if ps else 0.0
                        median_p = median(ps) if ps else 0.0
                        p_ratio = peak/(median_p+1e-12)
                        second = ps[1] if len(ps)>1 else 0.0
                        peak_vs_second = peak/(second+1e-12)
                        # delta_prev unavailable per-row without context; set 0
                        feat_vec = [cep_conf, hs, acf, peak, p_ratio, peak_vs_second, 0.0, sel or 0.0, cep or 0.0]
                        pred = mobj['model'].predict([feat_vec])[0]
                        corrected_bpm = (cep if pred==1 else sel)
                        outrow = dict(r)
                        outrow['model_predict_cep'] = int(pred)
                        outrow['corrected_bpm'] = corrected_bpm
                        writer.writerow(outrow)
                print('Wrote', outp)
        except Exception as e:
            print('Apply failed:', e)

    print('\nDone.')
