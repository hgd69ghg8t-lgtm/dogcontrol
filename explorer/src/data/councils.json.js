// Framework data loader: simplified council boundaries as TopoJSON, or null
// when no Stats NZ boundary file has been added to data/geo/ yet.
import {buildGeo, findInput} from "../../../scripts/build_geo.mjs";

const input = process.env.GEO_INPUT || findInput(); // GEO_INPUT: test with another file
process.stdout.write(JSON.stringify(input ? await buildGeo(input) : null));
