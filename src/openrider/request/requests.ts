/** HTTP helpers for the PHP backend. */
export abstract class Requests {
    /** Posts url-encoded form parameters, as expected by the PHP endpoints. */
    public static post(url: string, params: Record<string, string | number>): Promise<Response> {
        const body = new URLSearchParams();
        for (const [key, value] of Object.entries(params)) {
            body.set(key, value.toString());
        }

        return fetch(url, { method: 'POST', body });
    }

    /**
     * Posts form parameters and parses the JSON response.
     *
     * @throws An error with the HTTP status when the response is not successful.
     */
    public static async postJson<T>(
        url: string,
        params: Record<string, string | number>,
    ): Promise<T> {
        const response = await Requests.post(url, params);
        if (!response.ok) {
            throw new Error(`${response.status} ${response.statusText}`);
        }

        return (await response.json()) as T;
    }
}
