// frontend/public/js/scanner.js
// QR-scanner via getUserMedia + jsQR. Geen bibliotheek-UI.

export class Scanner {
  constructor(videoId, onResult) {
    this.video   = document.getElementById(videoId);
    this.canvas  = document.getElementById('scan-canvas');
    this.ctx     = this.canvas.getContext('2d', { willReadFrequently: true });
    this.onResult = onResult;
    this.stream  = null;
    this.rafId   = null;
    this.running = false;
    this._lastCode = null;
    this._cooldown = false;
  }

  async start() {
    if (this.running) return;

    const constraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width:  { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    };

    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.video.srcObject = this.stream;
    this.video.style.display = '';
    await this.video.play();
    this.running = true;
    this._scan();
  }

  _scan() {
    if (!this.running) return;

    if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
      const vw = this.video.videoWidth;
      const vh = this.video.videoHeight;

      if (vw > 0 && vh > 0) {
        this.canvas.width  = vw;
        this.canvas.height = vh;
        this.ctx.drawImage(this.video, 0, 0, vw, vh);

        const imageData = this.ctx.getImageData(0, 0, vw, vh);
        const code = jsQR(imageData.data, vw, vh, {
          inversionAttempts: 'dontInvert',
        });

        if (code && code.data && !this._cooldown) {
          this._cooldown = true;
          this.onResult(code.data);
          return; // stop scanning, caller roept stop() aan
        }
      }
    }

    this.rafId = requestAnimationFrame(() => this._scan());
  }

  async stop() {
    this.running = false;
    if (this.rafId) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
      this.video.style.display = 'none';
    }
    this._cooldown = false;
  }
}
