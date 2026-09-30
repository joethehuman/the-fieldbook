// A deployment must select the app its project is configured to serve.
/** @param {string} actual
 * @param {{VERCEL?: string, FIELDBOOK_APP_KIND?: string}} environment
 */
export function assertAppKind(actual, environment = process.env) {
  const expected = environment.FIELDBOOK_APP_KIND;
  if (!expected && !environment.VERCEL) return;
  if (expected !== actual) {
    throw new Error(
      `Fieldbook app mismatch: build is ${actual}; FIELDBOOK_APP_KIND must be ${actual}.`,
    );
  }
}
