export const PRODUCT_NAME = "They Told Me by ProofStamp";
export const MANIFEST_VERSION = "proofstamp-collection-v1";
export const HASH_ALGORITHM = "SHA-256";
export const HASH_OID_SHA256 = "2.16.840.1.101.3.4.2.1";
export const TSTINFO_CONTENT_TYPE = "1.2.840.113549.1.9.16.1.4";
export const TIMESTAMPING_EKU = "1.3.6.1.5.5.7.3.8";
export const FREETSA_URL = "https://freetsa.org/tsr";

// SHA-256 fingerprints of the exact DER certificates used for browser trust pinning.
// These were observed from the current FreeTSA-published certificate files in the
// live integration test. Verification deliberately fails closed after rotation
// until the new certificate set is independently reviewed and these pins updated.
export const FREETSA_TSA_SHA256 = "32e841a95cc1164101ffde41298ef2fc75c1c4372ef095e88a6bbd47dfb191fc";
export const FREETSA_CA_SHA256 = "a6379e7cecc05faa3cbf076013d745e327bbbaa38c0b9af22469d4701d18aabc";

export const MAX_FILES = 10;
export const MAX_FILE_BYTES = 40 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 150 * 1024 * 1024;
export const MAX_PACKAGE_BYTES = 180 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = MAX_FILES + 8;
