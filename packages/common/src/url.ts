import { sanitizeUrl } from "@braintree/sanitize-url";

import { escapeDoubleQuotes } from "./utils";

/**
 * Detects local file/folder paths:
 * - Windows drive paths: C:\..., D:/...
 * - UNC paths: \\server\share
 * - file:/// protocol URLs
 */
export const isLocalFilePath = (link: string): boolean => {
  const trimmed = link.trim();
  return /^[a-zA-Z]:[\\\/]|^\\\\|^file:\/\/\//i.test(trimmed);
};

export const normalizeLink = (link: string) => {
  link = link.trim();
  if (!link) {
    return link;
  }
  // Local file paths should not go through sanitizeUrl (it rejects them)
  if (isLocalFilePath(link)) {
    return link;
  }
  return sanitizeUrl(escapeDoubleQuotes(link));
};

export const isLocalLink = (link: string | null) => {
  return !!(
    link?.includes(location.origin) ||
    link?.startsWith("/") ||
    (link && isLocalFilePath(link))
  );
};

/**
 * Returns URL sanitized and safe for usage in places such as
 * iframe's src attribute or <a> href attributes.
 */
export const toValidURL = (link: string) => {
  link = normalizeLink(link);

  // Local file paths are valid as-is
  if (isLocalFilePath(link)) {
    return link;
  }

  // make relative links into fully-qualified urls
  if (link.startsWith("/")) {
    return `${location.origin}${link}`;
  }

  try {
    new URL(link);
  } catch {
    // if link does not parse as URL, assume invalid and return blank page
    return "about:blank";
  }

  return link;
};
