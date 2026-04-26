import React from 'react'
import { Composition } from 'remotion'
import { Trailer, TrailerProps } from './Trailer'

const FPS               = 30
const INTRO_FRAMES      = 3 * FPS              // 3.0s
const GAMEPLAY_FRAMES   = Math.round(9.3 * FPS) // 9.3s — matches XD.mov
const OUTRO_FRAMES      = 5 * FPS              // 5.0s
const TOTAL_FRAMES      = INTRO_FRAMES + GAMEPLAY_FRAMES + OUTRO_FRAMES

export const RemotionRoot: React.FC = () =>
{
    return (
        <>
            <Composition
                id="Trailer"
                component={Trailer}
                durationInFrames={TOTAL_FRAMES}
                fps={FPS}
                width={1920}
                height={1080}
                defaultProps={{
                    gameplayPath: 'gameplay.mp4',
                    introFrames:    INTRO_FRAMES,
                    gameplayFrames: GAMEPLAY_FRAMES,
                    outroFrames:    OUTRO_FRAMES,
                } satisfies TrailerProps}
            />

            <Composition
                id="TrailerVertical"
                component={Trailer}
                durationInFrames={TOTAL_FRAMES}
                fps={FPS}
                width={1080}
                height={1920}
                defaultProps={{
                    gameplayPath: 'gameplay.mp4',
                    introFrames:    INTRO_FRAMES,
                    gameplayFrames: GAMEPLAY_FRAMES,
                    outroFrames:    OUTRO_FRAMES,
                } satisfies TrailerProps}
            />
        </>
    )
}
