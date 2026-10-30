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
     * Posts a multipart form, e.g. with the bytes of a track file as a file, and parses the JSON
     * response.
     *
     * @param params - Text parameters, or files given as bytes.
     * @throws See {@link Requests.check}.
     */
    public static async postFormJson<T>(
        url: string,
        params: Record<string, string | number | Uint8Array<ArrayBuffer>>,
    ): Promise<T> {
        const body = new FormData();
        for (const [key, value] of Object.entries(params)) {
            if (value instanceof Uint8Array) {
                body.set(key, new Blob([value], { type: 'application/octet-stream' }), key);
            } else {
                body.set(key, value.toString());
            }
        }

        const response = await fetch(url, { method: 'POST', body });
        await Requests.check(response);

        return (await response.json()) as T;
    }

    /**
     * Posts form parameters and parses the JSON response.
     *
     * @throws See {@link Requests.check}.
     */
    public static async postJson<T>(
        url: string,
        params: Record<string, string | number>,
    ): Promise<T> {
        const response = await Requests.post(url, params);
        await Requests.check(response);

        return (await response.json()) as T;
    }

    /**
     * Checks that a response is successful.
     *
     * @throws An error with the message given by the backend in the `error` field of its JSON
     * response, or with the HTTP status.
     */
    public static async check(response: Response): Promise<void> {
        if (response.ok) {
            return;
        }

        let message = `${response.status} ${response.statusText}`.trim();
        try {
            const body = (await response.json()) as { error?: unknown };
            if (typeof body.error === 'string') {
                message = body.error;
            }
        } catch {
            // Not a JSON response, e.g. from a proxy: the status is the only information
        }
        throw new Error(message);
    }
}
