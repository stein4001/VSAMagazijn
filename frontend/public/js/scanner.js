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

      // Bereken qrbox op basis van de container breedte
      const container = document.getElementById(this.containerId);
      const w = container ? container.offsetWidth : 280;
      const box = Math.round(Math.min(w * 0.7, 260));

      await this.instance.start(
        cam.id,
        {
          fps: 12,
          qrbox: { width: box, height: box },
          aspectRatio: 4/3,
          disableFlip: false,
          rememberLastUsedCamera: false,
          showTorchButtonIfSupported: false,
          showZoomSliderIfSupported: false,
          defaultZoomValueIfSupported: 1,
        },
        (decodedText) => { this.onResult(decodedText); },
        () => {}
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
