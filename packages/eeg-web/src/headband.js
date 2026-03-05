export const HEADBAND_FRAME_SCHEMA_VERSION = "v1";
export var HeadbandTransportState;
(function (HeadbandTransportState) {
    HeadbandTransportState["Idle"] = "idle";
    HeadbandTransportState["Connecting"] = "connecting";
    HeadbandTransportState["Connected"] = "connected";
    HeadbandTransportState["Streaming"] = "streaming";
    HeadbandTransportState["Degraded"] = "degraded";
    HeadbandTransportState["Reconnecting"] = "reconnecting";
    HeadbandTransportState["Disconnected"] = "disconnected";
    HeadbandTransportState["Error"] = "error";
})(HeadbandTransportState || (HeadbandTransportState = {}));
