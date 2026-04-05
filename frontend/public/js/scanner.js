// frontend/public/js/scanner.js
// QR-scanner wrapper. Gebruikt de camera als beschikbaar.

export class Scanner {
  constructor(containerId, onResult) {
    this.containerId = containerId;
    this.onResult = onResult;
    this.instance = null;
    this.running = false;
  }

  async start() {
    if (this.running) return;

    // Wacht tot Html5Qrcode geladen is (via CDN script tag in HTML)
    if (typeof Html5Qrcode === 'undefined') {
      console.warn('Html5Qrcode niet beschikbaar, scanner uitgeschakeld');
      return;
    }

    try {
      this.instance = new Html5Qrcode(this.containerId);
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras || cameras.length === 0) throw new Error('Geen camera gevonden');

      // Voorkeur: back-camera
      const cam = cameras.find(c => /back|achter|environment/i.test(c.label)) || cameras[cameras.length - 1];

      await this.instance.start(
        cam.id,
        { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.333 },
        (decodedText) => {
          this.onResult(decodedText);
        },
        () => {} // ignore parse errors
      );
      this.running = true;
    } catch (err) {
      console.warn('Scanner start fout:', err.message);
      // Geef fout terug zodat UI kan terugvallen op handmatig invoer
      throw err;
    }
  }

  async stop() {
    if (this.instance && this.running) {
      await this.instance.stop().catch(() => {});
      this.running = false;
    }
  }
}
