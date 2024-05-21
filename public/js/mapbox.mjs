/* eslint-disable */
export const displayMap = (locations) => {
  mapboxgl.accessToken =
    'pk.eyJ1IjoidG9tbWNjYW5uIiwiYSI6ImNsb2FsZjUwNTBod2Mya3BiOW04bnV6NWUifQ.brIcrWSyMM8CeirCnLt17A';

  var map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/tommccann/cloalvo47009701r2g4g41vxb',
    scrollZoom: false,
    //   center: [-118.113491, 34.111745],
    //   zoom: 4,
    //   interactive: true
  });

  const bounds = new mapboxgl.LngLatBounds();

  locations.forEach((loc) => {
    // Create marker
    const el = document.createElement('div');
    el.className = 'marker';

    // Add marker
    new mapboxgl.Marker({
      element: el,
      anchor: 'bottom',
    })
      .setLngLat(loc.coordinates)
      .addTo(map);

    // Add popup
    new mapboxgl.Popup({
      offset: 30,
    })
      .setLngLat(loc.coordinates)
      .setHTML(`<p>Day ${loc.day}: ${loc.description}</p>`)
      .addTo(map);

    // Extend map bounds to include current locations
    bounds.extend(loc.coordinates);
  });

  map.fitBounds(bounds, {
    padding: {
      top: 200,
      bottom: 150,
      left: 100,
      right: 100,
    },
  });
};
