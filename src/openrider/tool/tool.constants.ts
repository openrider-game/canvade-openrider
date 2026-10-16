import { ToolIcon } from './tool';

// Inline icons of the item and line tools, as 14x14 PNG data URLs.
// The other tools use svg icons from media/icon.
/** Icon of the `TargetTool`. */
export const TARGET_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAA+0lEQVQoU2NkIBMwkqmPAZtGBaBh+VxcDBYgQ799YzgBpCYC8QNkS9A1OrCyMmwxN2dgd3ZmYAEp3LuX4c+JEww//vxh8AVyD8A0I2tUAGq6MmsWA3dCAqoHFixgYEhLY/j2+zeDNsxmZI0TbG0Zcg4dYmDG5m+g3J8jRximAuUKQPJwjUA/nSgtZTBvaMAeXCDxtjaGo0BbbUjW2N3NcBIYWOBAQ3dqNtCp4EBBB3Z2DH8PH2aYguFUoAAocK4CA4cLW+CkpjJ8BYasDrbAAVkCio6tFhYMbMjRcfw4w0+gJh9c0QFznQLIOWgJYALMJmzxiD04cYiSnVYBx/BOD75iif8AAAAASUVORK5CYII=',
};

/** Icon of the `CheckpointTool`. */
export const CHECKPOINT_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAA60lEQVQoU2NkIBMwkqmPAZdGAaCB+lBDLwLpD+gWYNPYAFRUj6ZwApBfiCyGppFzGQMDfyADw3IOBgYHqLoDQDrtCwPDo4MMDD99YJqRNSYwMHDOZGC4xsbAoIBmIcil0r8ZGL6lARkLQJLIGjcwMOT7MzCAXIUNFAAFJ24EEgFoGrlOMDCUmjMwgLyIDYDEpwID6o0BtWxkAPqRC+jHp0A/gmIDGYD8KAP041esfgRKsm9lYFB0ZGCYzokaqpnfGRjunmNg+G2DLVRBYiCrQJ7JR7NyIlQcnhDwpRxwIADBBSAmKuXgCFVUYQB7ODAP/zl/3wAAAABJRU5ErkJggg==',
};

/** Icon of the `BombTool`. */
export const BOMB_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAA80lEQVQoU2NkIBMwkqmPAZtGBaBh+VwMDBYgQ78xMJwAUhOB+AGyJegaHVgZGLaYMzCwOzMwsIAU7mVg+APU+eMPA4MvkHsAphlZowJQ05VZDAzcCWjuXwDkpwEt/83AoA2zGVnjBFsGhpxDDAzM2PwNlPtzhIFhKlCuACQP1wj004lSBgbzBhyhBRJvY2A4CrTVhmSN3QwMJ4GBBQ40dKdmA50KDhR0YMfA8PcwA8MUDKcCBUCBcxUYOFzYAieVgeErMGR1sAUOyBJQdGwFuoUNOTqOMzD8BGrywRUdMNcpgJyDlgAmwGyCKaJqksMRIajCAPcZNg+bMA2tAAAAAElFTkSuQmCC',
};

/** Icon of the `SlowMoTool`. */
export const SLOWMO_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAABCklEQVQoU2NkIBMwkqmPAZtGBaBh+ZycnBYgQ79//34CSE0E4gfIlqBrdGBhYdliYmLCbm9vzwJSePDgwT+nT5/+8ffvX18g9wBMM7JGBaCmKxMmTOCOiopC8cGyZcsYCgoKvv3580cbZjOyxgmWlpY5W7duZcbmby8vrz8nTpyYCpQrAMnDNQL9dCIvL8+8vLwca3h1dnYy9Pb2HgXaakOyxkmTJp0EBhY40NCdmg10KjhQ0IG3t/ff48ePT8FwKlAAFDhXgYHDhS1w8vPzvwJDVgdb4IAsAUXHVlNTUzY7OzuwzYcOHfpz6tSpn0BNPriiA+Y6BZBz0BLABJhN2OIRa2jiEiQ7rQIAX99mD5/aTbMAAAAASUVORK5CYII=',
};

/** Icon of the `GravityTool`. */
export const GRAVITY_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAABHElEQVQoU42QzUoCYRSGH+kPs0UtEnKTrdzWtmtIsEVBkuCuoBbdQncwi5KWQlHoSqj7yI2LVrapIBcVNIbUovebGZ3xa9QODN+Zc97n/CUIrSx3NfI/yj01icQgm+SaNHsYPM6qCr5ywxfFYRAKpKjzyUwsuMAPLjvKNWwQIa7QeZUYNiPdpcu3SgcWjuoHquxrlEura0nIlVYhXMQGC+pX44lZFoPS73qXPH+7P+bfUU0kpROcsTyobY5yTEdLpKPz2x1NzmGLI26Z9oR5HeWOc3knk8B1Ce55C2T+mBv6mpNAmOOZC1Y84SEv9MhEofgdfYXDJgd8MEWLij3mODCrZDvosqb38b8dzXUfPLFLzobGdTS5/hWdOPAXFiAzD4GmcBMAAAAASUVORK5CYII=',
};

/** Icon of the `BoostTool`. */
export const BOOST_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAA5klEQVQoU2NkIBMwkqmPAaSxgZOTQfX7d4ZVQPZGYg0Ca5SXZ6h//Zrh9+/fDL+AeDVQbAMhQ8Aa6+sZ6hsagKqBytesYfi1dCkDGzc3w6uvXxmWAeUXAvEFdJegaIRJfvgAN+T31q0MrOzsDM9+/gR7ZSIQPwCpw6oR2XSYId3dDL+uXQO75CbQJdOJ0rgRGGQgjVevgjXewqkRZAtIMdC/v7dsATv1OdSpE7A6FRQ4a9cy/FqyBGzya2jgLMAZOAoKkOj49QscJbDoAEUJTgDyYwIwAbhBEwBexcimUJTkiE1lKOoAvC5w7vOxxigAAAAASUVORK5CYII=',
};

/** Icon of the `TeleporterTool`. */
export const TELEPORTER_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAAXNSR0IArs4c6QAAANdJREFUOE+d0jFqAlEQxvGfZxCrSA4QW69g0mqheAOLwNZaZbdKak8hWqxtFo+QNoJlQCvxBhbhLQhrdpG4Uw3vvf+bmW++hprRqMmpAh/x2tTshk9PTl+Y41As8hd8Qzw01NbO3+3traxCGiO5wEUwVPpZWgpgMQI4MgpHHWxDUgTf+/rTVFo59sDA2voDsyuwpfU5Nn6e5+OUIxJZWGRHx5e7wImJVFoGcbPVnp6NTblVPOG7SpxEIs5FrRYnXFyt4+xsZyeT3VzHRZEHRPca4N8OrO3VXy/aQA8BldDfAAAAAElFTkSuQmCC',
};

/** Icon of the `SolidLineTool`. */
export const SOLID_LINE_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAY0lEQVQ4T53S0QmAMAyE4b9LuIlO4bhOoZs4hUQMlNImV/OcjwtcCj+nTLgFOL79TYWOVuACJNiiHbizxC6ycyM4RBEM0QimqAcl1EIZ1XAK1fAEvNy3p+yjvA6DNhLKegxDHzm4IA9ZY5FTAAAAAElFTkSuQmCC',
};

/** Icon of the `SceneryLineTool`. */
export const SCENERY_LINE_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAdElEQVQ4T2NkIBMwEqtv3bp1Yn/+/NkCUh8WFmZGlEYkTaYMDAynidKIromFhcUnKCjoFV4bcWkCORenRnyacGokpAmrRmI0YWgkVhOKRlI0wTWSqgmucdWqVacYGBjAkQuLJ0IpChwdUI0MxGrCG4+EbAQAEzpiD4Q7bNkAAAAASUVORK5CYII=',
};

/** Icon of the `SolidBrushTool`. */
export const SOLID_BRUSH_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAJ0lEQVQ4T2NkIBMwkqmPYaRrPAUNODNsAYgvcMjWiDemRnp04A0cADZMAg80IkHmAAAAAElFTkSuQmCC',
};

/** Icon of the `SceneryBrushTool`. */
export const SCENERY_BRUSH_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAALklEQVQ4T2NkIBMwkqmPYURrXLVq1SlQwIWFhZlhC0CcgUO2RkLRNKKjg1DgAACPswgPeqoQowAAAABJRU5ErkJggg==',
};

/** Icon of the `ResetTool`. */
export const RESET_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAVklEQVQoU2NkIBMwkqmPAVnjTCINSQepQ9HIp8mXJmIrglX/m8NvGD5d/zQLKImpUSlNKc14pjFWjWfTzzLcm3VvVCO20MEbOGRHB7kJgEh9EGVkp1UAF5pCD2FwdOkAAAAASUVORK5CYII=',
};

/** Icon of the `EngineOffTool`. */
export const ENGINE_OFF_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAVklEQVQoU2NkIBMwkqmPAVnjTCINSQepQ9GoyceXZisiglX/4TdvGK5/+jQLKImpMU1JKW2msTFWjelnzzLMundvVCO20MEbOGRHB7kJgEh9EGVkp1UAF5pCDwQrzcsAAAAASUVORK5CYII=',
};

/** Icon of the `SlipperyTool`. */
export const SLIPPERY_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAVklEQVQoU2NkIBMwkqmPAVnjTCINSQepQ9EoISGRpqqqilX/7du3GV68eDELKImp0dbWNi0mJgarxiVLljAcPnx4VCO20MEbOGRHB7kJgEh9EGVkp1UAL8pCD0H8tlkAAAAASUVORK5CYII=',
};

/** Icon of the `InvincibilityTool`. */
export const INVINCIBILITY_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAVUlEQVQoU2NkIBMwkqmPAVnjTCINSQepQ9HIx6eZJiJii1X/mzeHGT59uj4LKImpUUkpLc3YGLvFZ8+mM9y7N2tUI7ZgxRs4ZEcHuQmASH0QZWSnVQAXmkIPHM3YNQAAAABJRU5ErkJggg==',
};

/** Icon of the `ZeroGravityTool`. */
export const ZERO_GRAVITY_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAeUlEQVR4AeSSMQqAMAxFgwfo5AncMjv3OumZ2ut0du7mCZw8gWnoYCBCEDcL/xfy8wiETPDyfQJmHu4RtwGoiQGRFiJTAZGEGKbAOUZYczbVs8HIp0CpOO134FErbCmZ6tl9b2o5Z2tlL8VUz57AxIFH3Ab6cqTitAsAAP//hXwIQwAAAAZJREFUAwD5bkIdrgyVNwAAAABJRU5ErkJggg==',
};

/** Icon of the `NoSteerTool`. */
export const NOSTEER_IMAGE: ToolIcon = {
    type: 'b64',
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAVklEQVQoU2NkIBMwkqmPAVnjTCINSQepQ9GoqcmXZmsrglX/4cNvGK5f/zQLKImpMS1NKW3mTGOsGtPTzzLMmnVvVCO20MEbOGRHB7kJgEh9EGVkp1UAkmpCD0bsG/8AAAAASUVORK5CYII=',
};
