const Arbundles = require("arbundles");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("fs");

const inputFolder = "./bundles";
const outputFolder = "./output";

const unpackBundleFromFile = (file) => {
  const bundleTxData = readFileSync(file);
  return unpackBundle(bundleTxData);
};

const unpackBundle = async (bundleTxData) => {
  const bundle = Arbundles.unbundleData(bundleTxData);

  await bundle.verify();

  return bundle;
};

const getTxMetadata = (item) => JSON.parse(item.rawData.toString());

const getTxTags = (item) =>
  item.tags.reduce((prev, curr) => {
    return {
      ...prev,
      [curr.name]: curr.value,
    };
  }, {});

const getFileData = (bundle, dataTxId) => {
  const file = bundle.items.find((item) => item.id === dataTxId);
  return file ? file.rawData.toString() : undefined;
};

const createOutputFolderFor = (bundleList) => {
  // Create output folder if not exists
  if (!existsSync(outputFolder)) {
    mkdirSync(outputFolder);
  }

  bundleList.forEach((name) => {
    const outputFilePath = `${outputFolder}/${name}`;
    if (!existsSync(outputFilePath)) {
      mkdirSync(outputFilePath);
    }
  });
};

const getBundlesFiles = (bundlesFolder) =>
  readdirSync(bundlesFolder).filter((file) => file !== ".gitkeep");

const formatJSON = (object) => JSON.stringify(object, null, "\t");

const isMetadataTx = (item) => item.tags.some((tag) => tag.name === "ArFS");

const run = () => {
  const bundleFiles = getBundlesFiles(inputFolder);

  createOutputFolderFor(bundleFiles);

  bundleFiles.forEach(async (bundleFileName) => {
    const bundlePath = `${inputFolder}/${bundleFileName}`;
    const bundle = await unpackBundleFromFile(bundlePath);

    bundle.items.forEach((item) => {
      const id = item.id;
      const isMetadata = isMetadataTx(item);

      const metadata = isMetadata ? getTxMetadata(item) : {};
      const dataTxId = metadata.dataTxId;
      const tags = getTxTags(item);
      const output = { metadata, tags };

      const outputPath = `${outputFolder}/${bundleFileName}`;
      writeFileSync(`${outputPath}/${id}.json`, formatJSON(output));

      if (dataTxId) {
        const fileData = getFileData(bundle, dataTxId);
        if (fileData) {
          writeFileSync(`${outputPath}/${metadata.dataTxId}`, fileData);
        }
      }
    });
  });
};

run();
