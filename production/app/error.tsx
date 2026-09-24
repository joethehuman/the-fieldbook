"use client";
import ReadingError from "./[section]/[[...id]]/error";

// Also catch failures in the reader layout, which its own segment boundary
// cannot wrap.
export default ReadingError;
