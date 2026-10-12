// Observable Framework config for the explorer, published at <site>/explore/.
export default {
  title: "NZ Dog Control Explorer",
  root: "src",
  style: "style.css",
  pages: [
    {name: "Council map", path: "/map"},
    {name: "Breed explorer", path: "/breeds"}
  ],
  sidebar: false,
  pager: false,
  toc: false,
  search: false,
  preserveExtension: true, // links to map.html etc. work on any static host, including a local http.server
  header: `<nav class="site-nav">
    <a href="../index.html" class="brand">NZ Dog Control Statistics</a>
    <a href="../index.html">Dashboard</a>
    <a href="./map.html">Council map</a>
    <a href="./breeds.html">Breed explorer</a>
  </nav>`,
  footer: `Source: <a href="https://www.mcert.govt.nz/our-work/local-government/dog-control/dog-control-statistics/">MCERT dog control statistics</a>
    (CC BY 3.0 NZ). Council boundaries: Stats NZ (CC BY 4.0).`
};
