// Toevoeging aan app.js: laad artikelen voor het scan-grid
// Dit blok wordt toegevoegd aan de initWorker functie

async function loadArtikelGrid() {
  try {
    const arts = await API.getArtikelen();
    const icons = {'Gereedschap':'🔩','Elektra':'🔌','Verbruiksartikelen':'📄','PBM':'⛑️','Bevestigingsmateriaal':'🔧'};
    document.getElementById('artikel-grid').innerHTML = arts.slice(0,6).map(a => `
      <button class="qr-btn" onclick="handleScanResult('${a.qr_code}')">
        <span class="qr-btn-icon">${icons[a.categorie] || '📦'}</span>
        ${a.naam.split(' ').slice(0,2).join(' ')}
      </button>`).join('');
  } catch {}
}
