import React from 'react'
import {
    AbsoluteFill,
    Audio,
    Sequence,
    useCurrentFrame,
    useVideoConfig,
    spring,
    interpolate,
    Easing,
    staticFile,
} from 'remotion'
import { Video } from '@remotion/media'
import { loadFont as loadSpaceGrotesk } from '@remotion/google-fonts/SpaceGrotesk'
import { loadFont as loadInter } from '@remotion/google-fonts/Inter'
import { loadFont as loadJetBrainsMono } from '@remotion/google-fonts/JetBrainsMono'

const { fontFamily: SPACE_GROTESK } = loadSpaceGrotesk('normal', { weights: ['700'] })
const { fontFamily: INTER          } = loadInter('normal',         { weights: ['500', '700'] })
const { fontFamily: JETBRAINS      } = loadJetBrainsMono('normal', { weights: ['500'] })

// ── Brand tokens (mirror the in-game CSS) ──────────────────────────────────
const COLORS = {
    bgDeep:    '#08080F',
    bgSurface: '#1A1A2D',
    redline:   '#FF2E4D',
    cyan:      '#00E5FF',
    amber:     '#FFB627',
    text:      '#F5F5FA',
    text2:     '#9999B0',
    textDim:   '#5A5A75',
}

export type TrailerProps = {
    gameplayPath:   string
    introFrames:    number
    gameplayFrames: number
    outroFrames:    number
}

// ── Top-level composition ──────────────────────────────────────────────────
export const Trailer: React.FC<TrailerProps> = ({
    gameplayPath, introFrames, gameplayFrames, outroFrames,
}) =>
{
    return (
        <AbsoluteFill style={{ backgroundColor: COLORS.bgDeep }}>
            {/* Background music spans the entire trailer */}
            <Audio src={staticFile('music.mp3')} volume={0.65} />

            <Sequence durationInFrames={introFrames}>
                <IntroScene />
            </Sequence>

            <Sequence from={introFrames} durationInFrames={gameplayFrames}>
                <GameplayScene gameplayPath={gameplayPath} duration={gameplayFrames} />
            </Sequence>

            <Sequence
                from={introFrames + gameplayFrames}
                durationInFrames={outroFrames}
            >
                <OutroScene duration={outroFrames} />
            </Sequence>

            {/* Persistent atmospheric layers above everything */}
            <FilmGrain />
        </AbsoluteFill>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Intro: REDLINE wordmark with chromatic aberration + synthwave grid
// ──────────────────────────────────────────────────────────────────────────
const IntroScene: React.FC = () =>
{
    const frame    = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()

    const wmSpring = spring({ frame, fps, config: { damping: 16, stiffness: 110 } })
    const wmScale  = interpolate(wmSpring, [0, 1], [0.92, 1])
    const wmOpacity = interpolate(frame, [0, 14], [0, 1], { extrapolateRight: 'clamp' })

    const slashScale = spring({ frame: frame - 12, fps, config: { damping: 200 } })
    const taglineOp  = interpolate(frame, [22, 38], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

    // Vignette / fade-out at the end of the intro toward the gameplay
    const exitOp = interpolate(frame, [70, 90], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

    const responsive = Math.min(width / 1920, height / 1080)

    return (
        <AbsoluteFill
            style={{
                opacity: exitOp,
                fontFamily: SPACE_GROTESK,
                backgroundColor: COLORS.bgDeep,
            }}
        >
            <SynthwaveGrid />
            <SpeedLines />

            <AbsoluteFill style={{
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', textAlign: 'center',
            }}>
                <Wordmark
                    text="REDLINE"
                    style={{
                        fontSize: 280 * responsive,
                        opacity: wmOpacity,
                        transform: `scale(${wmScale})`,
                    }}
                />

                <div style={{
                    width: 540 * responsive,
                    height: 3,
                    marginTop: 20 * responsive,
                    background: `linear-gradient(90deg, transparent, ${COLORS.redline}, transparent)`,
                    boxShadow: `0 0 28px ${COLORS.redline}80`,
                    transform: `scaleX(${slashScale})`,
                    transformOrigin: 'center',
                }} />

                <div style={{
                    marginTop: 36 * responsive,
                    fontFamily: INTER,
                    fontWeight: 500,
                    fontSize: 36 * responsive,
                    color: COLORS.text2,
                    letterSpacing: '0.02em',
                    opacity: taglineOp,
                }}>
                    Race clean. Or <span style={{ color: COLORS.redline, fontWeight: 700 }}>wreck everything</span>.
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Gameplay: the user's screen recording with corner overlays + FX layers
// ──────────────────────────────────────────────────────────────────────────
const GameplayScene: React.FC<{ gameplayPath: string; duration: number }> = ({
    gameplayPath, duration,
}) =>
{
    const frame = useCurrentFrame()

    // Fades into and out of the section
    const fadeIn  = interpolate(frame, [0, 18], [0, 1], { extrapolateRight: 'clamp' })
    const fadeOut = interpolate(frame, [duration - 18, duration], [1, 0], { extrapolateLeft: 'clamp' })
    const opacity = Math.min(fadeIn, fadeOut)

    // Ken Burns — slow zoom for dynamism
    const zoom = interpolate(frame, [0, duration], [1.02, 1.10])

    // Periodic 3-frame RGB glitch every 2 seconds (skipping the first 30 frames)
    const glitchActive = frame > 30 && (frame % 60) < 3

    // Scanning bar that sweeps top → bottom every 3 seconds
    const scanProgress = ((frame + 10) % 90) / 90    // 0 → 1
    const scanY        = scanProgress * 100

    // REC indicator pulses on a fast sine
    const recPulse = (Math.sin(frame * 0.18) + 1) * 0.5

    // Timestamp bottom-left like a security cam
    const seconds = Math.floor(frame / 30)
    const cs      = Math.floor((frame % 30) * 100 / 30)
    const tsLabel = `00:${String(seconds).padStart(2, '0')}.${String(cs).padStart(2, '0')}`

    return (
        <AbsoluteFill style={{ opacity, backgroundColor: COLORS.bgDeep }}>
            {/* Synthwave backdrop visible in the letterbox bars */}
            <SynthwaveGrid intensity={0.55} />

            {/* Video with color grading + Ken Burns */}
            <div style={{
                position: 'absolute',
                inset: 0,
                transform: `scale(${zoom})`,
                transformOrigin: 'center center',
            }}>
                <Video
                    src={staticFile(gameplayPath)}
                    muted
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        filter: [
                            'saturate(1.30)',
                            'contrast(1.14)',
                            'brightness(0.97)',
                            'drop-shadow(0 0 80px rgba(255, 46, 77, 0.45))',
                        ].join(' '),
                    }}
                />
            </div>

            {/* Glitch flicker — full-screen RGB tint bursts */}
            {glitchActive && (
                <>
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(255, 46, 77, 0.18)',
                        mixBlendMode: 'screen',
                        pointerEvents: 'none',
                    }} />
                    <div style={{
                        position: 'absolute', inset: 0,
                        background: 'rgba(0, 229, 255, 0.10)',
                        mixBlendMode: 'screen',
                        transform: 'translate(-3px, 0)',
                        pointerEvents: 'none',
                    }} />
                </>
            )}

            {/* Scanning light bar sweeping top → bottom */}
            <div style={{
                position: 'absolute',
                left: 0, right: 0,
                top: `${scanY}%`,
                height: 90,
                background: 'linear-gradient(180deg, transparent 0%, rgba(255, 46, 77, 0.35) 50%, transparent 100%)',
                mixBlendMode: 'screen',
                pointerEvents: 'none',
                opacity: 0.7,
            }} />

            {/* Vignette */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.55) 100%)',
                pointerEvents: 'none',
            }} />

            {/* Scanlines (very subtle) */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'repeating-linear-gradient(0deg, transparent 0, transparent 2px, rgba(0,0,0,0.06) 2px, rgba(0,0,0,0.06) 3px)',
                pointerEvents: 'none',
                opacity: 0.7,
            }} />

            {/* Bottom red accent line for HUD feel */}
            <div style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                height: 3,
                background: `linear-gradient(90deg, transparent, ${COLORS.redline} 50%, transparent)`,
                boxShadow: `0 0 18px ${COLORS.redline}`,
            }} />

            {/* Top-left wordmark */}
            <div style={{
                position: 'absolute',
                top: 36, left: 36,
                fontFamily: SPACE_GROTESK,
                fontWeight: 700,
                fontSize: 32,
                letterSpacing: '-0.02em',
                color: COLORS.text,
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            }}>
                RED<span style={{ color: COLORS.redline }}>LINE</span>
            </div>

            {/* Top-right pulsing REC */}
            <div style={{
                position: 'absolute',
                top: 40, right: 36,
                fontFamily: JETBRAINS,
                fontSize: 18,
                letterSpacing: '0.2em',
                color: COLORS.text2,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                textShadow: '0 2px 12px rgba(0,0,0,0.6)',
            }}>
                <span style={{
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background: COLORS.redline,
                    opacity: 0.55 + recPulse * 0.45,
                    boxShadow: `0 0 ${10 + recPulse * 12}px ${COLORS.redline}`,
                }} />
                REC
            </div>

            {/* Bottom-left timestamp */}
            <div style={{
                position: 'absolute',
                bottom: 36, left: 36,
                fontFamily: JETBRAINS,
                fontSize: 16,
                color: COLORS.text2,
                letterSpacing: '0.25em',
                textShadow: '0 2px 12px rgba(0,0,0,0.7)',
            }}>
                COMBAT · {tsLabel}
            </div>

            {/* Bottom-right mode tag */}
            <div style={{
                position: 'absolute',
                bottom: 36, right: 36,
                fontFamily: JETBRAINS,
                fontSize: 14,
                fontWeight: 500,
                color: COLORS.redline,
                letterSpacing: '0.3em',
                padding: '6px 14px',
                border: `1px solid ${COLORS.redline}80`,
                borderRadius: 4,
                textShadow: '0 2px 12px rgba(0,0,0,0.7)',
            }}>
                MODE 02
            </div>
        </AbsoluteFill>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Outro: tagline + URL CTA
// ──────────────────────────────────────────────────────────────────────────
const OutroScene: React.FC<{ duration: number }> = ({ duration }) =>
{
    const frame = useCurrentFrame()
    const { fps, width, height } = useVideoConfig()
    const responsive = Math.min(width / 1920, height / 1080)

    const taglineSpr = spring({ frame:        frame,        fps, config: { damping: 200 } })
    const urlSpr     = spring({ frame: frame - 26, fps, config: { damping: 200 } })

    const fadeOut    = interpolate(frame, [duration - 18, duration], [1, 0], { extrapolateLeft: 'clamp' })

    return (
        <AbsoluteFill
            style={{
                backgroundColor: COLORS.bgDeep,
                opacity: fadeOut,
                alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', textAlign: 'center',
            }}
        >
            <SynthwaveGrid intensity={0.7} />

            <div style={{
                fontFamily: SPACE_GROTESK,
                fontWeight: 700,
                fontSize: 120 * responsive,
                letterSpacing: '-0.02em',
                color: COLORS.text,
                opacity: taglineSpr,
                transform: `translateY(${(1 - taglineSpr) * 30}px)`,
            }}>
                <Wordmark text="REDLINE" style={{ fontSize: 220 * responsive }} />
            </div>

            <div style={{
                marginTop: 48 * responsive,
                fontFamily: JETBRAINS,
                fontWeight: 500,
                fontSize: 38 * responsive,
                color: COLORS.text2,
                letterSpacing: '0.18em',
                opacity: urlSpr,
                transform: `translateY(${(1 - urlSpr) * 20}px)`,
            }}>
                <span style={{ color: COLORS.redline, marginRight: 14 }}>▶</span>
                redline.victorgalvez.dev
            </div>
        </AbsoluteFill>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Reusable: REDLINE wordmark with chromatic aberration
// ──────────────────────────────────────────────────────────────────────────
const Wordmark: React.FC<{ text: string; style?: React.CSSProperties }> = ({
    text, style,
}) =>
{
    return (
        <div style={{
            position: 'relative',
            fontFamily: SPACE_GROTESK,
            fontWeight: 700,
            letterSpacing: '-0.04em',
            color: COLORS.text,
            lineHeight: 0.9,
            textShadow: '0 0 60px rgba(255,46,77,0.45), 0 0 120px rgba(255,46,77,0.18)',
            ...style,
        }}>
            <span style={{
                position: 'absolute', inset: 0,
                color: COLORS.redline,
                transform: 'translate(8px, 0)',
                opacity: 0.85,
                mixBlendMode: 'screen',
            }}>{text}</span>
            <span style={{
                position: 'absolute', inset: 0,
                color: COLORS.cyan,
                transform: 'translate(-8px, 0)',
                opacity: 0.7,
                mixBlendMode: 'screen',
            }}>{text}</span>
            {text}
        </div>
    )
}

// ──────────────────────────────────────────────────────────────────────────
// Reusable atmospheric layers
// ──────────────────────────────────────────────────────────────────────────
const SynthwaveGrid: React.FC<{ intensity?: number }> = ({ intensity = 1 }) =>
{
    const frame = useCurrentFrame()
    const offset = (frame * 2) % 60   // scroll the grid 2px per frame

    return (
        <div style={{
            position: 'absolute',
            bottom: 0, left: '-50%',
            width: '200%', height: '50%',
            perspective: '380px',
            perspectiveOrigin: '50% 100%',
            opacity: intensity,
            maskImage: 'linear-gradient(to top, black 25%, transparent 95%)',
            WebkitMaskImage: 'linear-gradient(to top, black 25%, transparent 95%)',
            pointerEvents: 'none',
        }}>
            <div style={{
                position: 'absolute',
                bottom: '-10%', left: 0,
                width: '100%', height: '110%',
                backgroundImage: `
                    linear-gradient(rgba(255, 46, 77, 0.45) 1px, transparent 1px),
                    linear-gradient(90deg, rgba(255, 46, 77, 0.45) 1px, transparent 1px)
                `,
                backgroundSize: '60px 60px',
                backgroundPosition: `0px ${offset}px`,
                transform: 'rotateX(72deg)',
                transformOrigin: 'center bottom',
            }} />
        </div>
    )
}

const SpeedLines: React.FC = () =>
{
    const frame = useCurrentFrame()

    const lines = [
        { top: '18%', speed: 3.6, opacity: 0.5 },
        { top: '32%', speed: 2.4, opacity: 0.7 },
        { top: '64%', speed: 3.0, opacity: 0.4 },
        { top: '78%', speed: 4.2, opacity: 0.6 },
    ]

    return (
        <div style={{
            position: 'absolute', inset: 0,
            overflow: 'hidden', pointerEvents: 'none',
            maskImage: 'radial-gradient(ellipse 70% 50% at 50% 50%, transparent 30%, black 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 50% at 50% 50%, transparent 30%, black 80%)',
        }}>
            {lines.map((line, i) =>
            {
                // Distance traveled across the screen as a function of frame
                const x = ((frame * line.speed) % 200) - 100   // -100% → +100% sliding
                return (
                    <div key={i} style={{
                        position: 'absolute',
                        top: line.top, left: `${x}%`,
                        width: '200%', height: 1,
                        background: `linear-gradient(90deg, transparent 0%, rgba(255,46,77,${line.opacity}) 50%, transparent 100%)`,
                    }} />
                )
            })}
        </div>
    )
}

const FilmGrain: React.FC = () =>
{
    return (
        <div style={{
            position: 'absolute', inset: 0,
            opacity: 0.04,
            mixBlendMode: 'overlay',
            pointerEvents: 'none',
            backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")",
        }} />
    )
}
