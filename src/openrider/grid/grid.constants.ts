/** Size of the physics grid cells, in world units. */
export const GRID_CELL_SIZE = 100,
    /** Size of the render cache grid cells, in world units. */
    CACHE_CELL_SIZE = 400,
    /** Maximum number of cells a single line can be spread across. */
    MAX_SPREAD = 5000,
    /**
     * Order of the cells of a 2x2 block, as [x, y] offsets from its top left cell.
     *
     * The order affects the physics, as the parts collide with the cells in this order: it must
     * not change, the recorded ghosts depending on it.
     */
    CELL_BLOCK_ACTION_OFFSET_ORDER: Array<[number, number]> = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 1],
    ];
