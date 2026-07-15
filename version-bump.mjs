import { readFileSync, writeFileSync } from "fs";

function readUtf8NoBom(filePath) {
	return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

const targetVersion = process.env.npm_package_version;

// read minAppVersion from manifest.json and bump version to target version
let manifest = JSON.parse(readUtf8NoBom("manifest.json"));
const { minAppVersion } = manifest;
manifest.version = targetVersion;
writeFileSync("manifest.json", JSON.stringify(manifest, null, "\t") + "\n", { encoding: "utf8" });

// update versions.json with target version and minAppVersion from manifest.json
let versions = JSON.parse(readUtf8NoBom("versions.json"));
versions[targetVersion] = minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, "\t") + "\n", { encoding: "utf8" });
