import dgram from "node:dgram";
import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));

const PORT = Number(process.env.PORT || 3000);

const adapterSettings = {
  dmx: {
    enabled: process.env.DMX_ENABLED === "1",
    host: process.env.DMX_HOST || "127.0.0.1",
    port: Number(process.env.DMX_PORT || 5568),
    universe: Number(process.env.DMX_UNIVERSE || 1)
  },
  artnet: {
    enabled: process.env.ARTNET_ENABLED === "1",
    host: process.env.ARTNET_HOST || "127.0.0.1",
    port: Number(process.env.ARTNET_PORT || 6454),
    universe: Number(process.env.ARTNET_UNIVERSE || 0)
  },
  kinet: {
    enabled: process.env.KINET_ENABLED === "1",
    host: process.env.KINET_HOST || "127.0.0.1",
    port: Number(process.env.KINET_PORT || 6038)
  },
  esp32: {
    enabled: process.env.ESP32_ENABLED === "1",
    host: process.env.ESP32_HOST || "127.0.0.1",
    port: Number(process.env.ESP32_PORT || 4210)
  }
};

class UDPAdapter {
  constructor({ host, port, enabled, name }) {
    this.host = host;
    this.port = port;
    this.enabled = enabled;
    this.name = name;
    this.socket = dgram.createSocket("udp4");
  }

  send(buffer) {
    if (!this.enabled) return;
    this.socket.send(buffer, this.port, this.host, (err) => {
      if (err) {
        console.error(`[${this.name}] send error`, err.message);
      }
    });
  }
}

class ArtNetAdapter extends UDPAdapter {
  constructor(settings) {
    super({ ...settings, name: "artnet" });
    this.universe = settings.universe;
  }

  sendFrame(channels) {
    const header = Buffer.from("Art-Net\0", "ascii");
    const opCode = Buffer.from([0x00, 0x50]);
    const protoVersion = Buffer.from([0x00, 14]);
    const sequence = Buffer.from([0x00]);
    const physical = Buffer.from([0x00]);
    const universe = Buffer.from([this.universe & 0xff, (this.universe >> 8) & 0xff]);
    const length = Buffer.from([(channels.length >> 8) & 0xff, channels.length & 0xff]);
    const payload = Buffer.from(channels);

    this.send(Buffer.concat([header, opCode, protoVersion, sequence, physical, universe, length, payload]));
  }
}

class SACNAdapter extends UDPAdapter {
  constructor(settings) {
    super({ ...settings, name: "dmx-sacn" });
    this.universe = settings.universe;
  }

  sendFrame(channels) {
    const rootLayer = Buffer.alloc(126, 0);
    rootLayer.writeUInt16BE(0x0010, 40);
    rootLayer.writeUInt16BE(this.universe, 113);
    Buffer.from(channels).copy(rootLayer, 125 - channels.length);
    this.send(rootLayer);
  }
}

class KinetAdapter extends UDPAdapter {
  constructor(settings) {
    super({ ...settings, name: "kinet" });
  }

  sendFrame(channels) {
    const header = Buffer.from([0x04, 0x01, 0xdc, 0x4a, 0x01, 0x00, 0x08, 0x01]);
    const payload = Buffer.from(channels);
    this.send(Buffer.concat([header, payload]));
  }
}

class ESP32Adapter extends UDPAdapter {
  constructor(settings) {
    super({ ...settings, name: "esp32" });
  }

  sendFrame(channels, mood) {
    const data = JSON.stringify({ type: "frame", mood, channels });
    this.send(Buffer.from(data));
  }
}

const adapters = {
  dmx: new SACNAdapter(adapterSettings.dmx),
  artnet: new ArtNetAdapter(adapterSettings.artnet),
  kinet: new KinetAdapter(adapterSettings.kinet),
  esp32: new ESP32Adapter(adapterSettings.esp32)
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function mapControlToChannels(frame) {
  const hue = clamp01(frame.hue || 0);
  const intensity = clamp01(frame.intensity || 0);
  const beat = clamp01(frame.beat || 0);
  const warmth = clamp01(frame.warmth || 0.5);

  const r = Math.round(255 * intensity * (0.5 + warmth * 0.5));
  const g = Math.round(255 * intensity * (1 - Math.abs(hue - 0.35)));
  const b = Math.round(255 * intensity * (0.5 + (1 - warmth) * 0.5));
  const strobe = beat > 0.65 ? 255 : Math.round(80 * beat);

  return [r, g, b, strobe, 255, 128, 64, 0];
}

wss.on("connection", (ws) => {
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "control_frame") return;

      const channels = mapControlToChannels(msg.payload || {});

      adapters.dmx.sendFrame(channels);
      adapters.artnet.sendFrame(channels);
      adapters.kinet.sendFrame(channels);
      adapters.esp32.sendFrame(channels, msg.payload?.mood || "neutral");
    } catch (err) {
      console.error("Invalid control message", err.message);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Flash Forward Reactive running on http://localhost:${PORT}`);
  console.log("Adapters:", adapterSettings);
});
