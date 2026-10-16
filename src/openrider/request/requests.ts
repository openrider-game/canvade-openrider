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
