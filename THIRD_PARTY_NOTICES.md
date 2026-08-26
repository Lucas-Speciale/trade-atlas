# Third-party notices

Trade Atlas combines original application code and visual design with the following third-party materials. The repository's `LICENSE` applies only to original materials and does not replace these terms.

## CEPII BACI

The generated trade files in `public/data/trade/` are derived from [CEPII BACI](https://www.cepii.fr/DATA_DOWNLOAD/baci/doc/baci_webpage.html), HS revision 2017.

- Source: CEPII BACI
- License: [Etalab Open Licence 2.0](https://www.etalab.gouv.fr/licence-ouverte-open-licence/)
- Changes: HS6 records are aggregated into HS2 and HS4 country, product, overlay, and bilateral-route partitions; reported thousands of US dollars are converted to dollars; rankings and validation metadata are derived during the build.

CEPII should be acknowledged as the source whenever the generated trade data is reused.

## Product classification metadata

The small HS2 and HS4 membership files under `data/raw/oec/` were obtained from the [Observatory of Economic Complexity](https://oec.world/). They provide classification labels and membership metadata used by the offline build. Users should consult the source for current terms before redistributing those files independently.

## Boundary geometry

The main generated geometry is derived from [World Bank Official Boundaries](https://datacatalog.worldbank.org/search/dataset/0038272/world-bank-official-boundaries). Geometry is normalized and reduced to the fields required by the application. Users should consult the dataset page for its current license and terms.

The supplemental Taiwan polygon is derived from [Natural Earth](https://www.naturalearthdata.com/), whose vector map data is in the public domain. It is included for data availability and does not imply a position on political status.

## Basemap and mapping libraries

- Map style and tiles: [OpenFreeMap](https://openfreemap.org/)
- Vector tile schema and styles: [OpenMapTiles](https://openmaptiles.org/)
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)
- Rendering library: [MapLibre GL JS](https://maplibre.org/maplibre-gl-js/docs/)

Map attribution is also displayed in the application. JavaScript dependencies retain the licenses included with their respective packages.
