//! Error types for the HAL

use std::fmt;

/// Errors that can occur when working with EEG devices
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HalError {
    /// Device is not connected
    NotConnected,
    /// Device connection failed
    ConnectionFailed(String),
    /// Device is already connected
    AlreadyConnected,
    /// Streaming is not active
    NotStreaming,
    /// Streaming failed to start
    StreamError(String),
    /// Invalid configuration
    InvalidConfig(String),
    /// Device-specific error
    DeviceError(String),
    /// Timeout waiting for data
    Timeout,
    /// Channel not found
    ChannelNotFound(String),
}

impl fmt::Display for HalError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            HalError::NotConnected => write!(f, "device not connected"),
            HalError::ConnectionFailed(msg) => write!(f, "connection failed: {msg}"),
            HalError::AlreadyConnected => write!(f, "device already connected"),
            HalError::NotStreaming => write!(f, "streaming not active"),
            HalError::StreamError(msg) => write!(f, "stream error: {msg}"),
            HalError::InvalidConfig(msg) => write!(f, "invalid configuration: {msg}"),
            HalError::DeviceError(msg) => write!(f, "device error: {msg}"),
            HalError::Timeout => write!(f, "timeout waiting for data"),
            HalError::ChannelNotFound(name) => write!(f, "channel not found: {name}"),
        }
    }
}

impl std::error::Error for HalError {}

pub type Result<T> = std::result::Result<T, HalError>;
