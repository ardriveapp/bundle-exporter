const Arbundles = require("arbundles");
const { readFileSync, existsSync, mkdirSync, writeFileSync } = require("fs");

const bundleFile = "./raw-bundle";
const outputFolder = "./bundle";

const unpackBundleFromFile = (file) => {
  const bundleTxData = readFileSync(file);
  return unpackBundle(bundleTxData);
};

const unpackBundle = async (bundleTxData) => {
  const bundle = Arbundles.unbundleData(bundleTxData);

  await bundle.verify();

  return bundle;
};

const getEntities = (bundle) => {
  return bundle.items.filter((item) =>
    item.tags.some((tag) => tag.name === "Entity-Type")
  );
};

const getNameAndDataTxFromEntity = (entity) => {
  const entityData = JSON.parse(entity.rawData.toString());
  const { name, dataTxId } = entityData;

  return { name, dataTxId };
};

const getFileData = (bundle, dataTx) => {
  const file = bundle.items.find((item) => item.id === dataTx);
  return file.rawData.toString();
};

const createOutputFolder = (outputFolder) => {
  if (!existsSync(outputFolder)) {
    mkdirSync(outputFolder);
  }
};

const run = async () => {
  const bundle = await unpackBundleFromFile(bundleFile);
  createOutputFolder(outputFolder);

  const entities = getEntities(bundle);

  entities.forEach((entity) => {
    const { name, dataTxId } = getNameAndDataTxFromEntity(entity);

    const fileData = getFileData(bundle, dataTxId);

    writeFileSync(`${outputFolder}/${name}`, fileData);
  });
};

run();
