const HEX_TABLE = '0123456789ABCDEF';

/** Color helpers. */
export abstract class Color {
    private static getDigit(limit: number): string {
        return HEX_TABLE[Math.round(Math.random() * limit)];
    }

    /**
     * Generates a random color using only the lower hexadecimal digits, so that it stays
     * readable on a white background.
     *
     * @returns A color in the `#RRGGBB` format.
     */
    public static generateRandomDark(): string {
        let color = '#';
        for (let i = 0; i < 6; i++) {
            color += Color.getDigit(10);
        }

        return color;
    }
}
