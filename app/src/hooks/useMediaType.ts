import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isMediaType, type MediaType } from "../media";

const STORAGE_KEY = "library.mediaType";

function readStored(): MediaType {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isMediaType(value) ? value : "book";
  } catch {
    return "book";
  }
}

function writeStored(type: MediaType) {
  try {
    localStorage.setItem(STORAGE_KEY, type);
  } catch {
    // private mode etc. — the URL param still carries it
  }
}

/**
 * The media type (book / music / movie) a page is working with. A `?type=` URL param
 * wins; otherwise it's the last type picked anywhere, so switching the library to Music
 * and then tapping Scan opens the scanner in music mode.
 */
export function useMediaType(): [MediaType, (type: MediaType) => void] {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("type");
  const [stored, setStored] = useState<MediaType>(readStored);
  const type = isMediaType(fromUrl) ? fromUrl : stored;

  useEffect(() => {
    if (isMediaType(fromUrl) && fromUrl !== stored) {
      writeStored(fromUrl);
      setStored(fromUrl);
    }
  }, [fromUrl, stored]);

  const setType = useCallback(
    (next: MediaType) => {
      writeStored(next);
      setStored(next);
      setParams(
        (p) => {
          const updated = new URLSearchParams(p);
          updated.set("type", next);
          return updated;
        },
        { replace: true }
      );
    },
    [setParams]
  );

  return [type, setType];
}
