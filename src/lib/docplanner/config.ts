/**
 * Docplanner Integrations API — address of the country's service.
 *
 * One API, many domains: the clinic's country decides where the token and the
 * data live (www.znanylekarz.pl, www.doctoralia.es, …). The field holds the
 * bare host; an empty field means the Polish service.
 */
export const DOCPLANNER_DEFAULT_HOST = "www.znanylekarz.pl";

/** A bare host name, lower-case — or `null` when the value is not one. */
export function docplannerHost(value: string): string | null {
  const host = (value.trim() || DOCPLANNER_DEFAULT_HOST).toLowerCase();
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : null;
}

/** Token endpoint (OAuth 2.0, client credentials, scope `integration`). */
export const docplannerTokenUrl = (host: string) => `https://${host}/oauth/v2/token`;
