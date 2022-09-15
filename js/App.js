export default class App {

  constructor() {
    // initialize Leaflet
    this.map = L.map('map').setView({lon: 37.61889, lat: 55.75515}, 11);

    this.osmApiUri = 'https://maps.mail.ru/osm/tools/overpass/api/interpreter';
    // this.osmApiUri = 'https://overpass.openstreetmap.ru/api/interpreter';
    // this.osmApiUri = 'https://z.overpass-api.de/api/interpreter';
    // this.osmApiUri = 'http://overpass-api.de/api/';

    this.fileElm = document.getElementById('kml-file');
    this.selectorElm = document.getElementById('kml-areas');
    this.getStreetsBtn = document.getElementById('get-streets');
    this.loadingOverlay = document.getElementById('loading-overlay');

    this.kmlDataRaw = '';
    this.polygons = {};
  }

  init() {
    // add the OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 15,
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OpenStreetMap contributors</a>'
    }).addTo(this.map);

    // show the scale bar on the lower left corner
    L.control.scale({imperial: true, metric: true}).addTo(this.map);

    this.setupFileListener();
    this.setupAreaSelector();
    this.setupExportButton();
  }

  clearMap() {
    _.forEach(this.polygons, (val, key) => {
      if(this.polygons[key].L) {
        this.map.removeLayer(this.polygons[key].L);
      }
    });
    this.polygons = {};
  }

  setupFileListener() {
    this.fileElm.addEventListener('change', (event) => {
      event.currentTarget.files[0].text()
        .then(row => this.kmlDataRaw += row)
        .then(() => this.parseXml());
    });
  }

  setupAreaSelector() {
    this.selectorElm.addEventListener('change', (event) => {
      const selectedArea = this.selectorElm.selectedOptions[0].innerText;
      const polygonData = this.polygons[selectedArea];
      if(!polygonData.drawn) {
        const polygon = L.polygon(polygonData.crdLatLon, {color: 'blue'}).addTo(this.map);
        polygon.bindPopup(selectedArea);
        polygonData.drawn = true;
        polygonData.L = polygon;
      }
      this.map.fitBounds(polygonData.L.getBounds());
    });
  }

  setupExportButton() {
    this.getStreetsBtn.addEventListener('click', async () => {
      this.loadingOverlay.classList.toggle('is-active');

      const selectedArea = this.selectorElm.selectedOptions[0].innerText;
      const crdStr = _.map(this.polygons[selectedArea].crdLatLon, crd => crd.join(' ')).join(' ');
      // https://wiki.openstreetmap.org/wiki/Overpass_API/Language_Guide
      // ищем только `type`:`way` и чтобы в `tags` присутствовал ключ `name` и не было объектов с ключами `brand`, `leisure`, `tourism` и др
      const link = `${this.osmApiUri}?data=${encodeURIComponent('[out:json];(way(poly:"'+crdStr+'")["name"]["surface"][!"brand"][!"leisure"][!"tourism"][!"motor_vehicle"][!"tunnel"];<;);out meta;')}`;

      try {
        const response = await fetch(link);
        const nodes = await response.json();
        const streets = _(nodes.elements)
          .filter(elm => elm.type !== 'relation')
          .map('tags.name')
          .uniq()
          .compact()
          .value()
          .sort();
        this.downloadFile(streets.join('\r\n'), `Streets ${selectedArea}.txt`);
      } catch (err) {
        alert('Что-то пошло не так. Ошибка: ' + err.message || err.toString());
      }

      this.loadingOverlay.classList.toggle('is-active');
    });
  }

  downloadFile(data, fileName) {
    const link = document.createElement("a");
    link.download = fileName;
    link.href = `data:text/html,${data}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  parseXml() {
    this.clearMap();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(this.kmlDataRaw,"text/xml");
    const placemarks = xmlDoc.getElementsByTagName("Placemark");

    for(const pm of placemarks) {
      const coordinatesRaw = pm.getElementsByTagName('coordinates')[0].innerHTML
        .replace(/,0/g,'')
        .split(/\n\s{1,}/);

      const crdLonLat = _(coordinatesRaw)
        .compact()
        .map(crd => crd.split(','))
        .value();

      this.polygons[pm.getElementsByTagName('name')[0].innerHTML] = {
        crdLonLat,
        crdLatLon: _.map(_.cloneDeep(crdLonLat), crd => _.reverse(crd)),
        drawn: false,
      };
    }

    this.updateAreaSelectorOptions();
  }

  updateAreaSelectorOptions() {
    for(let i = this.selectorElm.options.length - 1; i >= 1; i--) {
      this.selectorElm.remove(i);
    }

    _.forEach(this.polygons, (val, key) => {
      const option = document.createElement("option");
      option.text = key;
      option.value = key;
      this.selectorElm.appendChild(option);
      this.selectorElm.removeAttribute('disabled');
      this.getStreetsBtn.removeAttribute('disabled');
    });
  }

}
