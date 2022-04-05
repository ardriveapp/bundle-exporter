const arbundles = require("arbundles");
const processStream = require("arbundles/stream");

const {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	writeFileSync,
	closeSync,
	readSync,
} = require("fs");
//Needed as Arweave redirects with a 302
const https = require("follow-redirects/https");
const { exit } = require("process");

const inputFolder = "./bundles";
const outputFolder = "./output";
const txIdRegex = /^(\w|-){43}$/;
const startsWithArDriveRegex = /^ArDrive/;

const formatJSON = (object) => JSON.stringify(object, null, "\t");
const isMetadataTx = (item) => item.tags.some((tag) => tag.name === "ArFS");
const isArFSDataTx = (item) => {
	return (
		!isMetadataTx(item) &&
		item.tags.some(
			(tag) =>
				tag.name === "App-Name" &&
				tag.value.match(startsWithArDriveRegex)
		)
	);
};

//Handle arguments from STDIN
const myArgs = process.argv.slice(2);

const downloadBundle = (txId) => {
	if (existsSync(`${inputFolder}/${txId}`)) {
		console.log(
			`Bundle with txId ${txId} already exists in ${inputFolder}`
		);
		return;
	}

	console.log(`Downloading bundle with txId ${txId}...`);
	let reqURL = `https://arweave.net/${txId}`;
	//Need to promisify
	return new Promise(function (resolve, reject) {
		let promise = https.get(reqURL, (res) => {
			const writeStream = createWriteStream(`${inputFolder}/${txId}`);
			res.pipe(writeStream);
			writeStream.on("finish", () => {
				writeStream.close();
				console.log(`Finished downloading bundle with txId ${txId}`);
				resolve(promise);
			});
		});
		promise.onerror = reject;
	});
};

const checkTxArg = async (myArgs) => {
	if (myArgs.length) {
		if (myArgs[0].match(txIdRegex) != null) {
			let txId = myArgs[0].match(txIdRegex)[0];
			await downloadBundle(txId);
		} else {
			console.log("Invalid Arweave TX");
			exit;
		}
	}
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

const unpackBundle = async (bundleTxData) => {
	const bundle = arbundles.unbundleData(bundleTxData);

	await bundle.verify();

	return bundle;
};

const unpackBundleFromFile = (file) => {
	const bundleTxData = readFileSync(file);
	return unpackBundle(bundleTxData);
};

const getTxTags = (item) =>
	item.tags.reduce((prev, curr) => {
		return {
			...prev,
			[curr.name]: curr.value,
		};
	}, {});

const getFileDataBuffer = (bundlePath, dataItem) => {
	const { dataOffset, dataSize } = dataItem;
	console.log(
		`... unpacking item data with size ${dataSize} at offset ${dataOffset}...`
	);
	const dataBuffer = Buffer.alloc(dataSize);
	const fd = openSync(bundlePath);
	readSync(fd, dataBuffer, 0, dataSize, dataOffset);
	closeSync(fd);
	return dataBuffer;
};

const run = async () => {
	//Check arguments for a TxID
	await checkTxArg(myArgs);

	const txIdArg = myArgs[0].match(txIdRegex) ? myArgs[0] : undefined;

	let bundleFiles = getBundlesFiles(inputFolder);
	//Check if there are bundles to unpack
	if (!getBundlesFiles(inputFolder).length) {
		console.log("No bundles provided");
		return;
	}

	if (txIdArg) {
		bundleFiles = bundleFiles.filter((path) => path.includes(txIdArg));
	}

	createOutputFolderFor(bundleFiles);

	const arFSDataTxIDToTagsMap = {};
	const arFSDataTxIDToMetadataMap = {};

	for await (const bundleFileName of bundleFiles) {
		console.log(`Working on bundle with txId ${bundleFileName}...`);
		const bundlePath = `${inputFolder}/${bundleFileName}`;
		const outputPath = `${outputFolder}/${bundleFileName}`;
		const stream = createReadStream(bundlePath);
		const dataItemsIterable = await processStream.default(stream);
		const dataItemCount = dataItemsIterable.length;
		console.log(`Data item count: ${dataItemCount}`);

		let currentItemIndex = 0;
		dataItemsIterable.forEach((item) => {
			const id = item.id;
			console.log(
				`(${++currentItemIndex}/${dataItemCount}) Unpacking data item with txId ${id}...`
			);
			let tagsOutput = {
				dataItemTxId: id,
				tags: getTxTags(item),
			};

			const dataItemBuffer = getFileDataBuffer(bundlePath, item);

			// Write out a specialized .TAGS.json file when it's an ArFS dataTx
			if (isArFSDataTx(item)) {
				// If there's a metadata for this dataTx cached, write it out with tags and purge it
				if (arFSDataTxIDToMetadataMap[id]) {
					writeFileSync(
						`${outputPath}/${id}.TAGS.json`,
						formatJSON({
							...tagsOutput,
							...arFSDataTxIDToMetadataMap[id],
						})
					);
					delete arFSDataTxIDToMetadataMap[dataTxId];
				} else {
					// Else cache the dataTx's tags for write out when the metadataTx appears later
					console.log(`...Caching tags for dataTxID ${id}...`);
					arFSDataTxIDToTagsMap[id] = tagsOutput;
				}
			} else {
				// Write out ordinary data item tx tags
				writeFileSync(
					`${outputPath}/${id}.TAGS.json`,
					formatJSON(tagsOutput)
				);
			}

			// Discover and extract ArFS metadata if possible
			const { arFSMetadata, isPrivateArFSData } = (() => {
				let isPrivateArFSData = false;
				if (!isMetadataTx(item)) {
					return { undefined, isPrivateArFSData };
				}
				// Stub out private metadata if necessary
				isPrivateArFSData = item.tags.some(
					(tag) => tag.name === "Cipher"
				);

				const arFSMetadata = isPrivateArFSData
					? { encrypted: "encrypted" }
					: JSON.parse(dataItemBuffer.toString());
				return { arFSMetadata, isPrivateArFSData };
			})();

			// Match ArFS metadata with an ArFS dataTx
			if (arFSMetadata) {
				// If there's a dataTx seeking metadata for its tags, finally write them out
				const dataTxId = arFSMetadata.dataTxId;
				if (dataTxId) {
					if (arFSDataTxIDToTagsMap[dataTxId]) {
						writeFileSync(
							`${outputPath}/${dataTxId}.TAGS.json`,
							formatJSON({
								...arFSDataTxIDToTagsMap[dataTxId],
								metaDataItemTxId: id,
								metadata: arFSMetadata,
							})
						);
						delete arFSDataTxIDToTagsMap[dataTxId];
					} else {
						// Else enqueue the metadata for later output alongside the dataTx's tags
						console.log(
							`...Enqueuing metadata for dataTxID ${dataTxId}...`
						);
						arFSDataTxIDToMetadataMap[dataTxId] = {
							metadataTxId: id,
							metadata: arFSMetadata,
						};
					}
				} else {
					// Is a standalone metadata. Nothing to do.
				}
			}

			// Write out the data item data
			writeFileSync(
				`${outputPath}/${id}`,
				arFSMetadata && !isPrivateArFSData
					? formatJSON(arFSMetadata)
					: dataItemBuffer
			);
		});

		// Cleanup any unexpected "orphans"
		for (dataTxId of Object.keys(arFSDataTxIDToTagsMap)) {
			orphanTags = arFSDataTxIDToTagsMap[dataTxId];
			console.log(
				`Writing out orphan tags for txId ${orphanTags.dataItemTxId}...`
			);
			writeFileSync(
				`${outputPath}/${orphanTags.dataItemTxId}.TAGS.json`,
				formatJSON(orphanTags)
			);
		}

		// You could also write out dataTx tag files here for orphaned metadata
		// NOTE: This wouldn't make sense for folder metadata or an entity rename metadata
	}
	console.log("Bundles unpacked to ./output folder");
};

run();
