//! Core model trait

use eeg_hal::SampleBuffer;

/// Output from a model analysis
pub trait ModelOutput: Clone {
    /// Get a human-readable description of the output
    fn description(&self) -> String;

    /// Get the primary numeric value (if applicable)
    fn value(&self) -> Option<f32> {
        None
    }

    /// Get confidence level (0.0 to 1.0) if applicable
    fn confidence(&self) -> Option<f32> {
        None
    }
}

/// Core trait for EEG analysis models
///
/// Models take buffered EEG data and produce analysis outputs.
/// They maintain internal state for temporal analysis.
pub trait Model {
    /// The output type produced by this model
    type Output: ModelOutput;

    /// Get the model name
    fn name(&self) -> &str;

    /// Get the minimum number of samples required for analysis
    fn min_samples(&self) -> usize;

    /// Process a buffer of samples and produce output
    ///
    /// This may return `None` if there's not enough data yet,
    /// or if the model needs more time to produce a stable output.
    fn process(&mut self, buffer: &SampleBuffer) -> Option<Self::Output>;

    /// Reset the model's internal state
    fn reset(&mut self);

    /// Check if the model has enough data to produce output
    fn is_ready(&self, buffer: &SampleBuffer) -> bool {
        buffer.sample_count() >= self.min_samples()
    }
}
