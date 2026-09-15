export const PRODUCT_NAME = "They Told Me by ProofStamp";
export const MANIFEST_VERSION = "proofstamp-collection-v1";
export const HASH_ALGORITHM = "SHA-256";
export const HASH_OID_SHA256 = "2.16.840.1.101.3.4.2.1";
export const TSTINFO_CONTENT_TYPE = "1.2.840.113549.1.9.16.1.4";
export const TIMESTAMPING_EKU = "1.3.6.1.5.5.7.3.8";
export const FREETSA_URL = "https://freetsa.org/tsr";

// Published by FreeTSA for the certificate set introduced in March 2026.
// Verification deliberately fails closed when FreeTSA rotates these certificates
// until the application is reviewed and the pins are updated.
export const FREETSA_TSA_SHA256 = "8bfb0305bb64e2571ca507552ef3245cb1c2fee8728e0ff8689225081ea13467";
export const FREETSA_CA_SHA256 = "2151b61137ffa86bf664691ba67e7da0b19f98c758e3d228d5d8ebf27e044438";

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 180 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = MAX_FILES + 8;
