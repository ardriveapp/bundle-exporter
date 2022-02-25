# Bundle Exporter

A tool designed to fetch and unpack bundle data-items.

## Install

Clone repo

Install dependencies with ```yarn```

## Usage

Will unpack any RAW bundle located on ./bundles

Just run ```node index.js```

Alternatively, you can provide a bundle TX Id

e.g. 

```node index.js _y3VxYgw3jOSIU4i1tZft4FD27RBA3_nLOq6zDragQ0``` 

will download and unpack that bundle from Arweave.

Bundles are unpacked to ./output
