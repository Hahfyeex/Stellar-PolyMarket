# DisputeEvidenceUpload Component

## Overview
A React component that allows a Disputer to upload PNG or PDF files as evidence during a dispute. The file is pinned to IPFS and a CID is returned.

## IPFS Gateway
This component uses **Pinata** as the IPFS pinning service.

- **Upload endpoint**: Pinata API via the `pinata` SDK
- **Retrieval gateway**: `https://gateway.pinata.cloud/ipfs/<CID>`

## Example
Once a file is uploaded, retrieve it via:
https://gateway.pinata.cloud/ipfs/
## Usage
```tsx
<DisputeEvidenceUpload onCIDGenerated={(cid) => console.log(cid)} />