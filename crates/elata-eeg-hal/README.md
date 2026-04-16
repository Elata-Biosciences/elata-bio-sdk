# elata-eeg-hal

Hardware abstraction layer for EEG devices in the Elata SDK.

This crate defines the shared types and traits used across EEG integrations:

- `EegDevice` for device lifecycle and sample acquisition
- `ConfigurableDevice` for optional runtime configuration
- `DeviceInfo`, `DeviceState`, and channel metadata types
- `EegSample` and `SampleBuffer` for moving multi-channel data through analysis pipelines
- standard EEG band constants in `bands`

## What it is for

Use `elata-eeg-hal` when you are:

- implementing a new EEG device adapter
- building analysis code that should work across multiple EEG devices
- writing tests against synthetic or recorded EEG sources

## Basic example

```rust
use elata_eeg_hal::{ChannelConfig, DeviceInfo, DeviceState, EegDevice, Result, SampleBuffer};

struct DemoDevice {
    info: DeviceInfo,
    state: DeviceState,
}

impl DemoDevice {
    fn new() -> Self {
        Self {
            info: DeviceInfo::new("Demo", "Elata", 256, ChannelConfig::muse()),
            state: DeviceState::Disconnected,
        }
    }
}

impl EegDevice for DemoDevice {
    fn info(&self) -> DeviceInfo {
        self.info.clone()
    }

    fn state(&self) -> DeviceState {
        self.state
    }

    fn connect(&mut self) -> Result<()> {
        self.state = DeviceState::Connected;
        Ok(())
    }

    fn disconnect(&mut self) -> Result<()> {
        self.state = DeviceState::Disconnected;
        Ok(())
    }

    fn start_stream(&mut self) -> Result<()> {
        self.state = DeviceState::Streaming;
        Ok(())
    }

    fn stop_stream(&mut self) -> Result<()> {
        self.state = DeviceState::Connected;
        Ok(())
    }

    fn read_samples(&mut self, _buffer: &mut SampleBuffer) -> Result<usize> {
        Ok(0)
    }
}
```

Pair this crate with `elata-eeg-signal` for DSP utilities and `elata-eeg-models` for higher-level EEG analysis.
