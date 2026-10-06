//! claude-composio-mods: a ~52 s launch video for seven Claude Code plugins built on the
//! Composio CLI. Styled after the Composio DEV (dark) surface from brand.composio.dev.
//!
//! Every scene is one `Shot` whose length is a whole number of beats of the music, so cuts land
//! on beats. Scene times below are "content seconds": seconds after the incoming cross-fade.
//! The same constants place the sound effects in `Shot::audio`.
use fframes::{
    AnimateRuntimeInput, AudioMap, AudioTimestamp::*, AudioTrack, Color, Duration, FFramesContext,
    FontQuery, Frame, Overlap, Scene, Scenes, Svgr, Transform, Video,
    animation::{AnimationRuntime, Easing},
    include_media_dir,
};
use std::sync::LazyLock;

include_media_dir!(pub struct VideoMedia, "media");

pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;

/// The music tempo; `tools/synth.py` uses the same value and the same scene beats.
pub const BPM: f32 = 120.0;
const BEAT: f32 = 60.0 / BPM;
/// Cross-fade between scenes (`Overlap::Previous`).
const FADE: f32 = 0.4;

/// The repository slug; change it here only.
macro_rules! repo {
    () => {
        "tridha643/claude-composio-mods"
    };
}
const INSTALL_CMD: &str = concat!("/plugin marketplace add ", repo!());

// Composio DEV surface (brand.composio.dev/platforms, /colors, /codeblock).
const BG: &str = "#0f0f0f";
const CARD: &str = "#1e1e1e";
const POPOVER: &str = "#2a2a2a";
const BORDER: &str = "#2c2c2c";
const FG: &str = "#ffffff";
const MUTED: &str = "#a1a1a1";
const BRAND: &str = "#51a2ff";
const ON_BRAND: &str = "#0f0f0f";
const SUCCESS: &str = "#00ac60";
const DANGER: &str = "#ef4444";
const WARNING: &str = "#ec9f00";
// Code surface and Composio Dark syntax palette.
const CODE: &str = "#e6e6e6";
const DIM: &str = "#8b949e";
const STR: &str = "#56d364";
const KW: &str = "#ff7b72";
const FUNC: &str = "#79c0ff";

const SANS: &str = "Geist";
const MONO: &str = "JetBrains Mono";

// Grid: left column for copy, right column for the terminal mock.
const LEFT: f32 = 160.0;
const WIN_X: f32 = 880.0;
const WIN_Y: f32 = 196.0;
const WIN_W: f32 = 880.0;
const WIN_H: f32 = 660.0;
const TX: f32 = 920.0;
/// Baseline of terminal line `n`.
fn ln(n: usize) -> f32 {
    WIN_Y + 120.0 + n as f32 * 46.0
}

static EASE: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(0.5, &Easing::CubicBezier(0.16, 1.0, 0.3, 1.0)));
static SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| {
    AnimationRuntime::new(3.0, &Easing::Spring { mass: 1.0, stiffness: 170.0, damping: 20.0 })
});
static EXIT: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(0.25, &Easing::EaseIn));
static PRESS: LazyLock<AnimationRuntime> = LazyLock::new(|| {
    AnimationRuntime::new(3.0, &Easing::Spring { mass: 1.0, stiffness: 300.0, damping: 14.0 })
});

#[derive(Debug, Clone, Copy)]
enum Kind {
    Hook,
    Problem,
    Intro,
    TicketBand,
    ReviewChaser,
    Snippet,
    Daily,
    LinkPrefetch,
    Pulse,
    ReviewLint,
    Install,
    Outro,
}

/// Scene order and length in beats.
const STORY: [(Kind, u32); 12] = [
    (Kind::Hook, 7),
    (Kind::Problem, 8),
    (Kind::Intro, 6),
    (Kind::TicketBand, 10),
    (Kind::ReviewChaser, 10),
    (Kind::Snippet, 10),
    (Kind::Daily, 9),
    (Kind::LinkPrefetch, 10),
    (Kind::Pulse, 10),
    (Kind::ReviewLint, 9),
    (Kind::Install, 8),
    (Kind::Outro, 8),
];

#[derive(Debug)]
struct Shot {
    kind: Kind,
    beats: u32,
    first: bool,
    last: bool,
}

pub struct VideoVideo<'a> {
    pub media: &'a VideoMedia,
    shots: Vec<Shot>,
}

impl<'a> VideoVideo<'a> {
    pub fn new(media: &'a VideoMedia) -> Self {
        let shots = STORY
            .iter()
            .enumerate()
            .map(|(i, &(kind, beats))| Shot { kind, beats, first: i == 0, last: i == STORY.len() - 1 })
            .collect();
        Self { media, shots }
    }
}

impl std::fmt::Debug for VideoVideo<'_> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("VideoVideo").finish()
    }
}

impl Video for VideoVideo<'_> {
    const FPS: usize = 30;
    const WIDTH: usize = WIDTH;
    const HEIGHT: usize = HEIGHT;
    const BACKGROUND_COLOR: Color = Color::BLACK;

    fn duration(&self) -> Duration<'_> {
        Duration::Auto
    }

    fn audio(&self) -> AudioMap<'_> {
        // The bed is mixed to its own arrangement in tools/synth.py; fades only de-click it.
        AudioMap::from([AudioTrack::new("music.wav", Second(0.)..Eof).gain_db(0.1).fade_in(0.05).fade_out(1.5)])
    }

    fn define_scenes(&self) -> Scenes<'_> {
        Scenes::from(self.shots.iter().map(|s| s as &dyn Scene).collect::<Vec<_>>())
    }

    fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        fframes::svgr!(
            <svg xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={HEIGHT} viewBox="0 0 1920 1080">
                <rect width="1920" height="1080" fill={BG} />
                {grid()}
                {ctx.render_scenes(&frame)}
            </svg>
        )
    }
}

/// A faint hairline grid, the DEV surface's quiet texture.
fn grid<'a>() -> Svgr<'a> {
    let lines: Vec<Svgr> = (1..16)
        .map(|i| {
            let x = i as f32 * 120.0;
            fframes::svgr!(<path d={format!("M{x} 0 V1080")} />)
        })
        .chain((1..9).map(|i| {
            let y = i as f32 * 120.0;
            fframes::svgr!(<path d={format!("M0 {y} H1920")} />)
        }))
        .collect();
    fframes::svgr!(<g stroke={FG} stroke-opacity="0.025" stroke-width="1">{lines}</g>)
}

impl Scene for Shot {
    fn duration(&self) -> Duration<'_> {
        Duration::Seconds(self.beats as f32 * BEAT)
    }

    fn overlap(&self) -> Overlap {
        if self.first { Overlap::None } else { Overlap::Previous(FADE) }
    }

    fn name(&self) -> &'static str {
        match self.kind {
            Kind::Hook => "Hook",
            Kind::Problem => "Problem",
            Kind::Intro => "Intro",
            Kind::TicketBand => "TicketBand",
            Kind::ReviewChaser => "ReviewChaser",
            Kind::Snippet => "Snippet",
            Kind::Daily => "Daily",
            Kind::LinkPrefetch => "LinkPrefetch",
            Kind::Pulse => "Pulse",
            Kind::ReviewLint => "ReviewLint",
            Kind::Install => "Install",
            Kind::Outro => "Outro",
        }
    }

    fn audio(&self) -> AudioMap<'_> {
        // Scene-relative seconds: content time + the cross-fade lead.
        let o = self.lead();
        let at = |s: f32, file: &'static str, gain: f32| AudioTrack::new(file, Second(o + s)..Eof).gain_db(gain);
        let mut tracks = Vec::new();
        if !self.first {
            // Peaks ~0.3 s in, the middle of the cross-fade.
            tracks.push(AudioTrack::new("whoosh.wav", Second(0.)..Eof).gain_db(-13.));
        }
        let click = |s| at(s, "click.wav", -10.);
        let chime = |s| at(s, "chime.wav", -12.);
        match self.kind {
            Kind::Hook | Kind::Problem | Kind::Intro | Kind::Outro => {}
            Kind::TicketBand => tracks.extend([click(TB_PRESS), chime(TB_TOAST)]),
            Kind::ReviewChaser => tracks.extend([click(RC_PRESS), chime(RC_TOAST)]),
            Kind::Snippet => tracks.extend([click(SN_POST), chime(SN_TOAST)]),
            Kind::Daily => tracks.extend([chime(DY_FAIL_TOAST)]),
            Kind::LinkPrefetch => tracks.extend([chime(LP_TOAST)]),
            Kind::Pulse => tracks.extend([chime(PU_PB)]),
            Kind::ReviewLint => tracks.extend([chime(RL_TOAST)]),
            Kind::Install => {
                // A key tick every other character while the command types in.
                let n = INSTALL_CMD.chars().count();
                for i in (0..n).step_by(2) {
                    let gain = -15. - (i % 6) as f32 * 0.7;
                    tracks.push(at(IN_TYPE + i as f32 / IN_CPS, "key.wav", gain).pan(if i % 4 == 0 { -0.15 } else { 0.15 }));
                }
            }
        }
        AudioMap::from(tracks)
    }

    fn render_frame<'a>(&'a self, mut frame: Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
        let o = self.lead();
        let t = frame.seconds();
        let end = self.beats as f32 * BEAT + if self.first { 0.0 } else { FADE };
        let fade_in = if self.first { 1.0 } else { (t / FADE).min(1.0) };
        let fade_out = if self.last { 1.0 } else { ((end - t) / FADE).clamp(0.0, 1.0) };
        let f = &mut frame;
        let body = match self.kind {
            Kind::Hook => hook(f, ctx),
            Kind::Problem => problem(f, ctx, o),
            Kind::Intro => intro(f, ctx, o),
            Kind::TicketBand => ticket_band(f, ctx, o),
            Kind::ReviewChaser => review_chaser(f, ctx, o),
            Kind::Snippet => snippet(f, ctx, o),
            Kind::Daily => daily(f, ctx, o),
            Kind::LinkPrefetch => link_prefetch(f, ctx, o),
            Kind::Pulse => pulse(f, ctx, o),
            Kind::ReviewLint => review_lint(f, ctx, o),
            Kind::Install => install(f, ctx, o),
            Kind::Outro => outro(f, ctx, o),
        };
        fframes::svgr!(<g opacity={fade_in.min(fade_out)}>{body}</g>)
    }
}

impl Shot {
    /// Seconds into the scene where its content clock starts: halfway through the cross-fade,
    /// so the incoming scene is already moving while the outgoing one fades.
    fn lead(&self) -> f32 {
        if self.first { 0.0 } else { FADE / 2.0 }
    }
}

// ---------------------------------------------------------------------------------------------
// Motion helpers

fn ramp(f: &Frame, s: f32) -> f32 {
    f.animate_runtime(AnimateRuntimeInput { on_second: s, from: 0.0, to: 1.0, animation_runtime: &EASE })
}
fn rise(f: &Frame, s: f32, from: f32) -> f32 {
    f.animate_runtime(AnimateRuntimeInput { on_second: s, from, to: 0.0, animation_runtime: &SPRING })
}
fn leave(f: &Frame, s: f32) -> f32 {
    f.animate_runtime(AnimateRuntimeInput { on_second: s, from: 1.0, to: 0.0, animation_runtime: &EXIT })
}
/// Fades and springs `child` up into place at `s`.
fn show<'a>(f: &Frame, s: f32, child: Svgr<'a>) -> Svgr<'a> {
    fframes::svgr!(<g opacity={ramp(f, s)} transform={Transform::translate(0, rise(f, s, 36.0))}>{child}</g>)
}
/// Button press: dips to 0.93 and springs back.
fn press_scale(f: &Frame, s: f32) -> f32 {
    let down: f32 = f.animate_runtime(AnimateRuntimeInput { on_second: s, from: 0.0, to: 1.0, animation_runtime: &EXIT });
    let up: f32 = f.animate_runtime(AnimateRuntimeInput { on_second: s + 0.12, from: 0.0, to: 1.0, animation_runtime: &PRESS });
    1.0 - 0.07 * (down - up).clamp(0.0, 1.0)
}
/// Scale around (cx, cy).
fn scale_at(s: f32, cx: f32, cy: f32) -> Transform {
    Transform {
        translate_x: f64::from(cx * (1.0 - s)),
        translate_y: f64::from(cy * (1.0 - s)),
        scale: fframes::Scale { x: f64::from(s), y: f64::from(s) },
        ..Default::default()
    }
}
/// The prefix of `text` typed at `cps` characters per second from `s`.
fn typed<'a>(f: &Frame, s: f32, cps: f32, text: &'a str) -> &'a str {
    let n = (((f.seconds() - s) * cps).max(0.0)) as usize;
    match text.char_indices().nth(n) {
        Some((i, _)) => &text[..i],
        None => text,
    }
}
fn blink(f: &Frame) -> f32 {
    if (f.seconds() * 2.0) as usize % 2 == 0 { 1.0 } else { 0.0 }
}
fn mono_width(size: f32, text: &str) -> f32 {
    // JetBrains Mono advances are 0.6 em for every glyph.
    text.chars().count() as f32 * size * 0.6
}

// ---------------------------------------------------------------------------------------------
// Components

/// Brand eyebrow: a small brand-blue mark and a mono uppercase label.
fn eyebrow<'a>(x: f32, y: f32, text: &'a str, anchor: &'a str) -> Svgr<'a> {
    let mark_x = match anchor {
        "middle" => x - mono_width(26.0, text) / 2.0 - 14.0 - 2.0 * text.len() as f32,
        _ => x,
    };
    let text_x = if anchor == "middle" { x + 14.0 } else { x + 30.0 };
    fframes::svgr!(<g>
        <rect x={mark_x} y={y - 18.0} width="14" height="14" rx="2" fill={BRAND} />
        <text x={text_x} y={y} text-anchor={anchor} font-family={MONO} font-size="26" letter-spacing="4" fill={BRAND}>{text}</text>
    </g>)
}

/// The left column of a mod scene: eyebrow, title lines and caption lines.
fn side<'a>(f: &Frame, o: f32, label: &'a str, title: &'a [&'a str], caption: &'a [&'a str]) -> Svgr<'a> {
    let title_y = 440.0;
    let caption_y = title_y + (title.len() - 1) as f32 * 98.0 + 96.0;
    let titles: Vec<Svgr> = title
        .iter()
        .enumerate()
        .map(|(i, line)| {
            show(f, o + 0.08 + i as f32 * 0.08, fframes::svgr!(
                <text x={LEFT - 4.0} y={title_y + i as f32 * 98.0} font-family={SANS} font-weight="400" font-size="88" letter-spacing="-2.2" fill={FG}>{*line}</text>
            ))
        })
        .collect();
    let captions: Vec<Svgr> = caption
        .iter()
        .enumerate()
        .map(|(i, line)| {
            fframes::svgr!(<text x={LEFT} y={caption_y + i as f32 * 58.0} font-family={SANS} font-weight="400" font-size="44" fill={MUTED}>{*line}</text>)
        })
        .collect();
    fframes::svgr!(<g>
        {show(f, o, eyebrow(LEFT, 330.0, label, "start"))}
        {titles}
        {show(f, o + 0.4, fframes::svgr!(<g>{captions}</g>))}
    </g>)
}

/// A Claude Code window on the code surface.
fn window<'a>(f: &Frame, o: f32, title: &'a str, body: Svgr<'a>) -> Svgr<'a> {
    let y = rise(f, o + 0.1, 60.0);
    fframes::svgr!(<g opacity={ramp(f, o + 0.1)} transform={Transform::translate(0, y)}>
        <rect x={WIN_X} y={WIN_Y + 24.0} width={WIN_W} height={WIN_H} rx="18" fill="#000000" opacity="0.35" />
        <rect x={WIN_X} y={WIN_Y} width={WIN_W} height={WIN_H} rx="18" fill={CARD} stroke={FG} stroke-opacity="0.08" stroke-width="1.5" />
        <path d={format!("M{WIN_X} {} H{}", WIN_Y + 60.0, WIN_X + WIN_W)} stroke={FG} stroke-opacity="0.06" stroke-width="1.5" />
        <circle cx={WIN_X + 32.0} cy={WIN_Y + 30.0} r="8" fill="#3a3a3a" />
        <circle cx={WIN_X + 58.0} cy={WIN_Y + 30.0} r="8" fill="#3a3a3a" />
        <circle cx={WIN_X + 84.0} cy={WIN_Y + 30.0} r="8" fill="#3a3a3a" />
        <text x={WIN_X + WIN_W / 2.0} y={WIN_Y + 39.0} text-anchor="middle" font-family={MONO} font-size="24" fill={DIM}>{title}</text>
        <g font-family={MONO} font-size="28">{body}</g>
    </g>)
}

/// One mono line made of colored segments.
fn code<'a>(x: f32, y: f32, parts: &[(&'a str, &'a str)]) -> Svgr<'a> {
    let spans: Vec<Svgr> = parts
        .iter()
        .map(|&(text, fill)| fframes::svgr!(<tspan fill={fill}>{text}</tspan>))
        .collect();
    fframes::svgr!(<text x={x} y={y}>{spans}</text>)
}

/// A user prompt echoed in the transcript.
fn user<'a>(y: f32, text: &'a str) -> Svgr<'a> {
    code(TX, y, &[("> ", DIM), (text, CODE)])
}

/// An app logo on a white tile, so every brand mark keeps its own colors.
fn app<'a>(ctx: &FFramesContext<'a, '_>, file: &'a str, x: f32, y: f32, size: f32) -> Svgr<'a> {
    let Some(img) = ctx.get_image(file) else { return Svgr::empty() };
    let pad = size * 0.18;
    fframes::svgr!(<g>
        <rect x={x} y={y} width={size} height={size} rx={size * 0.24} fill={FG} />
        <image href={img.href()} x={x + pad} y={y + pad} width={size - 2.0 * pad} height={size - 2.0 * pad} />
    </g>)
}

/// A notification toast that pops up over the bottom-right of the window.
fn toast<'a>(
    f: &mut Frame,
    ctx: &FFramesContext<'a, '_>,
    s: f32,
    until: Option<f32>,
    text: &'a str,
    logo: Option<&'a str>,
) -> Svgr<'a> {
    let font = FontQuery { family: SANS, size: 30, weight: 500, ..Default::default() };
    let tw = f.text_width(ctx, font, text).unwrap_or(text.len() * 15) as f32;
    let icon = if logo.is_some() { 52.0 } else { 0.0 };
    let w = tw + icon + 84.0;
    let (x, y, h) = (WIN_X + WIN_W - 30.0 - w, WIN_Y + WIN_H - 40.0, 80.0);
    let opacity = ramp(f, s) * until.map_or(1.0, |e| leave(f, e));
    let sc = 0.94 + 0.06 * ramp(f, s);
    let logo_svg = logo.map_or(Svgr::empty(), |file| app(ctx, file, x + 54.0, y + 20.0, 40.0));
    fframes::svgr!(<g opacity={opacity} transform={Transform::translate(0, rise(f, s, 28.0))}>
        <g transform={scale_at(sc, x + w, y + h)}>
            <rect x={x} y={y + 10.0} width={w} height={h} rx="16" fill="#000000" opacity="0.4" />
            <rect x={x} y={y} width={w} height={h} rx="16" fill={POPOVER} stroke={FG} stroke-opacity="0.12" stroke-width="1.5" />
            <circle cx={x + 32.0} cy={y + h / 2.0} r="7" fill={BRAND} />
            {logo_svg}
            <text x={x + 54.0 + icon} y={y + 51.0} font-family={SANS} font-weight="500" font-size="30" fill={FG}>{text}</text>
        </g>
    </g>)
}

/// A UI button; `primary` is the white-fill CTA, otherwise a hairline secondary.
fn button<'a>(f: &Frame, x: f32, y: f32, w: f32, label: &'a str, focus: f32, pressed_at: f32) -> Svgr<'a> {
    let pressed = ramp(f, pressed_at);
    let sc = press_scale(f, pressed_at);
    let fill = f.animate_runtime(AnimateRuntimeInput {
        on_second: pressed_at,
        from: Color::hex(CARD),
        to: Color::hex(FG),
        animation_runtime: &EASE,
    });
    let ink = if pressed > 0.5 { ON_BRAND } else { FG };
    fframes::svgr!(<g transform={scale_at(sc, x + w / 2.0, y + 26.0)}>
        <rect x={x - 5.0} y={y - 5.0} width={w + 10.0} height="62" rx="14" fill="none" stroke={BRAND} stroke-width="3" opacity={focus} />
        <rect x={x} y={y} width={w} height="52" rx="10" fill={fill} stroke={FG} stroke-opacity="0.15" stroke-width="1.5" />
        <text x={x + w / 2.0} y={y + 36.0} text-anchor="middle" font-family={SANS} font-weight="500" font-size="28" fill={ink}>{label}</text>
    </g>)
}

/// Claude Code's input box with a blinking cursor.
fn prompt_box<'a>(f: &Frame, y: f32) -> Svgr<'a> {
    fframes::svgr!(<g>
        <rect x={TX - 4.0} y={y} width={WIN_W - 72.0} height="64" rx="12" fill="none" stroke={FG} stroke-opacity="0.16" stroke-width="1.5" />
        <text x={TX + 20.0} y={y + 42.0} fill={DIM}>">"</text>
        <rect x={TX + 52.0} y={y + 18.0} width="15" height="30" fill={CODE} opacity={blink(f)} />
    </g>)
}

// ---------------------------------------------------------------------------------------------
// Scenes

fn hook<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>) -> Svgr<'a> {
    // The first line is on screen from frame 0; the rest follows within half a second.
    let lines = ["Claude Code,", "wired into your", "whole workday."];
    let rows: Vec<Svgr> = lines
        .iter()
        .enumerate()
        .map(|(i, line)| {
            let s = i as f32 * 0.14;
            let opacity = if i == 0 { 1.0 } else { ramp(f, s) };
            fframes::svgr!(<text x={LEFT - 6.0} y={430.0 + i as f32 * 158.0} opacity={opacity} transform={Transform::translate(0, rise(f, s, if i == 0 { 14.0 } else { 40.0 }))} font-family={SANS} font-weight="400" font-size="144" letter-spacing="-3.6" fill={FG}>{*line}</text>)
        })
        .collect();
    let font = FontQuery { family: SANS, size: 144, weight: 400, ..Default::default() };
    let underline = f.text_width(ctx, font, "whole workday").unwrap_or(900) as f32;
    let draw = f.animate(&fframes::timeline!(at 0.7 => 1.4, animate 0.5_f32 => 1.0, Easing::CubicBezier(0.65, 0.0, 0.35, 1.0)));
    fframes::svgr!(<g>
        <g font-family={MONO} font-size="34">{code(LEFT, 210.0, &[("> ", DIM), ("claude", MUTED)])}</g>
        <rect x={LEFT + 140.0} y="184" width="17" height="34" fill={MUTED} opacity={blink(f)} />
        {rows}
        <rect x={LEFT} y="770" width={(underline * draw).max(0.5)} height="8" rx="4" fill={BRAND} opacity={ramp(f, 0.7)} />
    </g>)
}

fn problem<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let chips = [
        ("Standups", "googlecalendar.png"),
        ("PR nudges", "github.png"),
        ("Linear tickets", "linear.png"),
        ("Latency checks", "datadog.png"),
        ("Slack updates", "slack.png"),
    ];
    let font = FontQuery { family: SANS, size: 44, weight: 400, ..Default::default() };
    let widths: Vec<f32> = chips
        .iter()
        .map(|(label, _)| f.text_width(ctx, font, label).unwrap_or(300) as f32 + 128.0)
        .collect();
    let gap = 24.0;
    let rows = [0..3, 3..5];
    let dim = 1.0 - 0.5 * ramp(f, o + 1.0);
    let mut out = Vec::new();
    for (r, range) in rows.into_iter().enumerate() {
        let row_w: f32 = widths[range.clone()].iter().sum::<f32>() + gap * (range.len() - 1) as f32;
        let mut x = 960.0 - row_w / 2.0;
        let y = 330.0 + r as f32 * 120.0;
        for i in range {
            let (label, logo) = chips[i];
            let w = widths[i];
            out.push(show(f, o + 0.05 + i as f32 * 0.09, fframes::svgr!(<g>
                <rect x={x} y={y} width={w} height="92" rx="46" fill={CARD} stroke={BORDER} stroke-width="1.5" />
                {app(ctx, logo, x + 22.0, y + 20.0, 52.0)}
                <text x={x + 92.0} y={y + 61.0} font-family={SANS} font-weight="400" font-size="44" fill={FG}>{label}</text>
            </g>)));
            x += w + gap;
        }
    }
    fframes::svgr!(<g>
        <g opacity={dim}>{out}</g>
        {show(f, o + 0.9, fframes::svgr!(<text x="960" y="720" text-anchor="middle" font-family={SANS} font-weight="400" font-size="72" letter-spacing="-1.8" fill={FG}>"All of it, outside your terminal."</text>))}
    </g>)
}

fn intro<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    // Logo 56 px tall; its mark is ~46 px wide, the clear space kept around it.
    let (lw, lh) = (56.0 * 483.0 / 93.0, 56.0);
    let logo = ctx
        .get_image("composio-logo.png")
        .map_or(Svgr::empty(), |img| fframes::svgr!(<image href={img.href()} x={960.0 - lw / 2.0} y="300" width={lw} height={lh} />));
    fframes::svgr!(<g>
        {show(f, o, logo)}
        {show(f, o + 0.15, fframes::svgr!(<text x="960" y="560" text-anchor="middle" font-family={MONO} font-weight="400" font-size="96" letter-spacing="-1" fill={FG}>"claude-composio-mods"</text>))}
        {show(f, o + 0.35, fframes::svgr!(<text x="960" y="660" text-anchor="middle" font-family={SANS} font-weight="400" font-size="48" fill={MUTED}>"7 mods · one Composio CLI"</text>))}
    </g>)
}

const TB_HINT: f32 = 1.9;
const TB_PRESS: f32 = 2.8;
const TB_TOAST: f32 = 3.0;

fn ticket_band<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let hint = ramp(f, o + TB_HINT) * leave(f, o + TB_PRESS + 0.25);
    let done = ramp(f, o + TB_PRESS + 0.1);
    let band_y = 520.0;
    let band_h = 120.0 + 52.0 * hint;
    let body = fframes::svgr!(<g>
        {show(f, o + 0.4, user(ln(0), "add jitter to webhook retries"))}
        {show(f, o + 0.6, code(TX, ln(1), &[("● ", STR), ("Updated src/webhooks/sender.ts", CODE)]))}
        {show(f, o + 0.75, code(TX, ln(2), &[("● ", STR), ("Opened acme/api#318", CODE)]))}
        {show(f, o + 0.9, code(TX, ln(3), &[("  └ ", DIM), ("merged by Priya", DIM)]))}
        {show(f, o + 0.3, fframes::svgr!(<g>
            <rect x={TX - 4.0} y={band_y} width={WIN_W - 72.0} height={band_h} rx="12" fill={FG} fill-opacity="0.04" stroke={FG} stroke-opacity="0.1" stroke-width="1.5" />
            <rect x={TX - 4.0} y={band_y + 16.0} width="4" height={band_h - 32.0} rx="2" fill={BRAND} />
            <text x={TX + 20.0} y={band_y + 48.0} font-weight="700" fill={CODE}>"ENG-142"</text>
            <text x={TX + WIN_W - 100.0} y={band_y + 48.0} text-anchor="end" fill={MUTED} opacity={1.0 - done}>"● In Progress"</text>
            <text x={TX + WIN_W - 100.0} y={band_y + 48.0} text-anchor="end" fill={SUCCESS} opacity={done}>"✓ Done"</text>
            <text x={TX + 20.0} y={band_y + 94.0} fill={CODE}>"Add retry to webhook sender"</text>
            <g opacity={hint}>
                {code(TX + 20.0, band_y + 146.0, &[("all PRs merged · press ", FUNC), ("⏎", FG), (" to mark Done", FUNC)])}
            </g>
        </g>))}
        {show(f, o + 0.3, prompt_box(f, 704.0))}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "01 · TICKET-BAND", &["Your ticket,", "above the", "prompt."], &["Linear status stays in", "view while you work."])}
        {window(f, o, "claude · acme/api", body)}
        {toast(f, ctx, o + TB_TOAST, None, "ENG-142 → Done", Some("linear.png"))}
    </g>)
}

const RC_SELECT: f32 = 1.7;
const RC_PRESS: f32 = 2.3;
const RC_TOAST: f32 = 2.45;

fn review_chaser<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let prs = [
        ("acme/api#318", "retry jitter", "Priya", "2d"),
        ("acme/web#77", "dark mode", "Sam", "1d"),
        ("acme/infra#12", "pin node 22", "Jordan", "5h"),
    ];
    let select = ramp(f, o + RC_SELECT);
    let rows: Vec<Svgr> = prs
        .iter()
        .enumerate()
        .map(|(i, &(pr, what, who, age))| {
            let y = 392.0 + i as f32 * 118.0;
            let sel = if i == 0 { select } else { 0.0 };
            let never = 1000.0;
            show(f, o + 0.55 + i as f32 * 0.1, fframes::svgr!(<g>
                <rect x={TX - 4.0} y={y} width={WIN_W - 72.0} height="104" rx="12" fill={FG} fill-opacity={0.03 + 0.04 * sel} stroke={FG} stroke-opacity="0.08" />
                <rect x={TX - 4.0} y={y + 18.0} width="4" height="68" rx="2" fill={BRAND} opacity={sel} />
                {code(TX + 20.0, y + 44.0, &[(pr, CODE), ("  ", CODE), (what, DIM)])}
                {code(TX + 20.0, y + 84.0, &[("waiting on ", DIM), (who, CODE), (" · ", DIM), (age, DIM)])}
                {button(f, 1580.0, y + 26.0, 128.0, "Nudge", sel, if i == 0 { o + RC_PRESS } else { never })}
            </g>))
        })
        .collect();
    let body = fframes::svgr!(<g>
        {show(f, o + 0.35, user(ln(0), "/reviews"))}
        {show(f, o + 0.45, code(TX, ln(1), &[("3 PRs waiting on review", DIM)]))}
        {rows}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "02 · REVIEW-CHASER", &["Chase reviewers,", "not tabs."], &["Run /reviews and nudge", "in one keypress."])}
        {window(f, o, "claude · /reviews", body)}
        {toast(f, ctx, o + RC_TOAST, None, "Nudged Priya on acme/api#318", Some("slack.png"))}
    </g>)
}

const SN_POST: f32 = 2.6;
const SN_TOAST: f32 = 2.75;

fn snippet<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let card_y = 392.0;
    let bullets = [
        code(TX + 20.0, card_y + 54.0, &[("• Shipped retry jitter ", CODE), ("acme/api#318", FUNC)]),
        code(TX + 20.0, card_y + 104.0, &[("• ", CODE), ("ENG-142", FUNC), (" moved to Done", CODE)]),
        code(TX + 20.0, card_y + 154.0, &[("• Next: rate limits, ", CODE), ("ENG-150", FUNC)]),
    ];
    let bullets: Vec<Svgr> = bullets
        .into_iter()
        .enumerate()
        .map(|(i, b)| show(f, o + 0.8 + i as f32 * 0.22, b))
        .collect();
    let focus = ramp(f, o + SN_POST - 0.4);
    let body = fframes::svgr!(<g>
        {show(f, o + 0.35, user(ln(0), "/snippet"))}
        {show(f, o + 0.5, fframes::svgr!(<g>
            {code(TX, ln(1), &[("Drafted from", DIM)])}
            {app(ctx, "linear.png", TX + 228.0, ln(1) - 27.0, 34.0)}
            {app(ctx, "github.png", TX + 272.0, ln(1) - 27.0, 34.0)}
        </g>))}
        {show(f, o + 0.6, fframes::svgr!(<rect x={TX - 4.0} y={card_y} width={WIN_W - 72.0} height="290" rx="12" fill={FG} fill-opacity="0.03" stroke={FG} stroke-opacity="0.08" />))}
        {bullets}
        {show(f, o + 1.5, fframes::svgr!(<g>
            {button(f, TX + 20.0, card_y + 206.0, 120.0, "Post", focus, o + SN_POST)}
            {button(f, TX + 160.0, card_y + 206.0, 120.0, "Edit", 0.0, 1000.0)}
        </g>))}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "03 · SNIPPET", &["Your daily", "update, drafted."], &["/snippet writes it from", "Linear and GitHub."])}
        {window(f, o, "claude · /snippet", body)}
        {toast(f, ctx, o + SN_TOAST, None, "Posted to #eng-updates", Some("slack.png"))}
    </g>)
}

const DY_FAIL: f32 = 1.2;
const DY_FAIL_TOAST: f32 = 1.45;

fn daily<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let body = fframes::svgr!(<g>
        {show(f, o + 0.35, user(ln(0), "/standup"))}
        {show(f, o + 0.55, code(TX, ln(1), &[("Yesterday ", DIM), ("shipped acme/api#318", CODE)]))}
        {show(f, o + 0.65, code(TX, ln(2), &[("Today     ", DIM), ("ENG-150 rate limits", CODE)]))}
        {show(f, o + 0.75, code(TX, ln(3), &[("Blockers  ", DIM), ("none", CODE)]))}
        {show(f, o + DY_FAIL, code(TX, ln(5), &[("FAIL ", DANGER), ("webhooks/sender.test.ts", CODE)]))}
        {show(f, o + DY_FAIL + 0.1, code(TX, ln(6), &[("TimeoutError: upstream 504", DIM)]))}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "04 · COMPOSIO-DAILY", &["Standups and", "errors, handled."], &["Your standup drafted, failures", "matched to past errors."])}
        {window(f, o, "claude · acme/api", body)}
        {toast(f, ctx, o + DY_FAIL_TOAST, None, "Seen before: 4 matches in Datadog", Some("datadog.png"))}
    </g>)
}

const LP_PASTE: f32 = 0.5;
const LP_TOAST: f32 = 1.3;
const LP_REPLY: f32 = 1.9;

fn link_prefetch<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let reply = [
        code(TX, ln(5), &[("● ", STR), ("#318 ", CODE), ("\"Add retry jitter to webhook", FUNC)]),
        code(TX, ln(6), &[("  sender\"", FUNC), (" is merged, so ENG-142", CODE)]),
        code(TX, ln(7), &[("  only needs its docs update.", CODE)]),
    ];
    let reply: Vec<Svgr> = reply
        .into_iter()
        .enumerate()
        .map(|(i, line)| show(f, o + LP_REPLY + i as f32 * 0.12, line))
        .collect();
    let logos: Vec<Svgr> = ["slack.png", "linear.png", "github.png"]
        .into_iter()
        .enumerate()
        .map(|(i, file)| show(f, o + 0.6 + i as f32 * 0.08, app(ctx, file, LEFT + i as f32 * 68.0, 740.0, 52.0)))
        .collect();
    let body = fframes::svgr!(<g>
        {show(f, o + 0.35, user(ln(0), "what's left before we close this?"))}
        {show(f, o + LP_PASTE, code(TX, ln(1), &[("  github.com/acme/api/pull/318", FUNC)]))}
        {show(f, o + LP_PASTE + 0.08, code(TX, ln(2), &[("  linear.app/acme/issue/ENG-142", FUNC)]))}
        {show(f, o + LP_TOAST, fframes::svgr!(<g>
            {code(TX, ln(3) + 4.0, &[("  read via composio", DIM)])}
            {app(ctx, "github.png", TX + 340.0, ln(3) - 23.0, 34.0)}
            {app(ctx, "linear.png", TX + 384.0, ln(3) - 23.0, 34.0)}
        </g>))}
        {reply}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "05 · LINK-PREFETCH", &["Pasted links,", "already read."], &["Slack, Linear and GitHub", "context before Claude answers."])}
        {logos}
        {window(f, o, "claude · acme/api", body)}
        {toast(f, ctx, o + LP_TOAST, None, "Prefetched 2/2 links", Some("github.png"))}
    </g>)
}

const PU_DRAW: f32 = 0.5;
const PU_PB: f32 = 1.9;
const PU_BLOCK: f32 = 2.8;

fn pulse<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let ms = [420.0, 380.0, 395.0, 340.0, 362.0, 312.0, 330.0, 291.0, 305.0, 268.0, 281.0, 249.0, 238.0, 254.0, 216.0, 190.0_f32];
    let (cx0, cx1, cy0, cy1) = (TX + 10.0, TX + 770.0, 350.0, 570.0);
    let y_of = |v: f32| cy1 - (v - 150.0) / 300.0 * (cy1 - cy0);
    let pts: Vec<(f32, f32)> = ms
        .iter()
        .enumerate()
        .map(|(i, &v)| (cx0 + i as f32 * (cx1 - cx0) / (ms.len() - 1) as f32, y_of(v)))
        .collect();
    let len: f32 = pts.windows(2).map(|w| ((w[1].0 - w[0].0).powi(2) + (w[1].1 - w[0].1).powi(2)).sqrt()).sum();
    let d: String = pts.iter().enumerate().map(|(i, (x, y))| format!("{}{x:.1} {y:.1} ", if i == 0 { "M" } else { "L" })).collect();
    let drawn = f.animate_runtime(AnimateRuntimeInput { on_second: o + PU_DRAW, from: 0.0, to: 1.0, animation_runtime: &DRAW });
    let shown = ((drawn * ms.len() as f32) as usize).min(ms.len() - 1);
    let last = pts[ms.len() - 1];
    let pb = ramp(f, o + PU_PB);
    let pulse_r = 9.0 + 14.0 * ((f.seconds() - o - PU_PB) * 1.2).fract().max(0.0) * pb;
    let pulse_o = (1.0 - ((f.seconds() - o - PU_PB) * 1.2).fract()) * pb;
    let target_y = y_of(300.0);
    let body = fframes::svgr!(<g>
        {show(f, o + 0.35, code(TX, ln(0), &[("composio search", CODE), (" · last 16 calls", DIM)]))}
        {show(f, o + 0.4, fframes::svgr!(<g>
            <path d={format!("M{cx0} {target_y} H{}", TX + 780.0)} stroke={DIM} stroke-width="2" stroke-dasharray="10 10" />
            <text x={TX + 780.0} y={target_y - 14.0} text-anchor="end" fill={DIM}>"latency budget"</text>
        </g>))}
        <path d={d} fill="none" stroke={FG} stroke-width="4" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray={format!("{len} {len}")} stroke-dashoffset={len * (1.0 - drawn)} opacity={ramp(f, o + PU_DRAW)} />
        <circle cx={last.0} cy={last.1} r={pulse_r} fill="none" stroke={BRAND} stroke-width="3" opacity={pulse_o} />
        <circle cx={last.0} cy={last.1} r="9" fill={BRAND} opacity={pb} />
        {show(f, o + 0.4, fframes::svgr!(<g>
            <path d={format!("M{} 618 H{}", TX - 4.0, TX + 804.0)} stroke={FG} stroke-opacity="0.08" stroke-width="1.5" />
            {code(TX, 666.0, &[("● ", STR), ("composio search ", CODE)])}
            <text x={TX + 780.0} y="666" text-anchor="end" fill={CODE}>{format!("{:.0} ms", ms[shown])}</text>
        </g>))}
        {show(f, o + PU_BLOCK, fframes::svgr!(<g>
            {code(TX, 724.0, &[("✕ blocked: ", WARNING), ("github is already connected", CODE)])}
        </g>))}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "06 · COMPOSIO-PULSE", &["Every composio", "call, timed."], &["Latency against your budget,", "in the status line."])}
        {window(f, o, "claude · status line", body)}
        {toast(f, ctx, o + PU_PB, Some(o + PU_BLOCK - 0.1), "New best: composio search, 190 ms", None)}
    </g>)
}

static DRAW: LazyLock<AnimationRuntime> =
    LazyLock::new(|| AnimationRuntime::new(1.3, &Easing::CubicBezier(0.65, 0.0, 0.35, 1.0)));

const RL_TOAST: f32 = 1.5;

fn review_lint<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let added: Vec<Svgr> = [
        vec![("+ 42 ", STR), ("  ", CODE), ("const", KW), (" hit = cache.", CODE), ("get", FUNC), ("(q)", CODE)],
        vec![("+ 43 ", STR), ("  ", CODE), ("if", KW), (" (hit) ", CODE), ("return", KW), (" hit", CODE)],
        vec![("+ 44 ", STR), ("  cache.", CODE), ("set", FUNC), ("(q, ", CODE), ("await", KW), (" run", FUNC), ("(q))", CODE)],
    ]
    .iter()
    .enumerate()
    .map(|(i, parts)| {
        let y = ln(2) + i as f32 * 46.0;
        show(f, o + 0.6 + i as f32 * 0.12, fframes::svgr!(<g>
            <rect x={TX - 4.0} y={y - 32.0} width={WIN_W - 72.0} height="44" fill={STR} fill-opacity="0.1" />
            {code(TX, y, parts)}
        </g>))
    })
    .collect();
    let body = fframes::svgr!(<g>
        {show(f, o + 0.35, code(TX, ln(0), &[("● ", STR), ("Update", CODE), ("(src/search.ts)", DIM)]))}
        {show(f, o + 0.5, code(TX, ln(1), &[("  41 ", DIM), ("export async ", KW), ("function", KW), (" search", FUNC), ("(q) {", CODE)]))}
        {added}
        {show(f, o + RL_TOAST + 0.6, code(TX, ln(6), &[("checklist: ", DIM), ("eviction · TTL · invalidation", CODE)]))}
    </g>);
    fframes::svgr!(<g>
        {side(f, o, "07 · REVIEW-LINT", &["Guardrails", "while Claude", "edits."], &["Risky changes come with", "a review checklist."])}
        {window(f, o, "claude · acme/search", body)}
        {toast(f, ctx, o + RL_TOAST, None, "New cache in search.ts: checklist sent to Claude", None)}
    </g>)
}

const IN_TYPE: f32 = 0.4;
const IN_CPS: f32 = 52.0;

fn install<'a>(f: &mut Frame, _ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    let size = 38.0;
    let shown = typed(f, o + IN_TYPE, IN_CPS, INSTALL_CMD);
    let full_w = mono_width(size, "> ") + mono_width(size, INSTALL_CMD);
    let x0 = 960.0 - full_w / 2.0;
    let cursor_x = x0 + mono_width(size, "> ") + mono_width(size, shown) + 4.0;
    let done = shown.len() == INSTALL_CMD.len();
    fframes::svgr!(<g>
        {show(f, o, eyebrow(960.0, 300.0, "GET STARTED", "middle"))}
        {show(f, o + 0.1, fframes::svgr!(<text x="960" y="430" text-anchor="middle" font-family={SANS} font-weight="400" font-size="120" letter-spacing="-3" fill={FG}>"Install in one line."</text>))}
        {show(f, o + 0.3, fframes::svgr!(<g font-family={MONO} font-size={size}>
            <rect x="240" y="520" width="1440" height="128" rx="18" fill={CARD} stroke={FG} stroke-opacity="0.08" stroke-width="1.5" />
            <text x={x0} y="597" fill={DIM}>">"</text>
            <text x={x0 + mono_width(size, "> ")} y="597" fill={CODE}>{shown}</text>
            <rect x={cursor_x} y="566" width="20" height="40" fill={CODE} opacity={if done { blink(f) } else { 1.0 }} />
        </g>))}
        {show(f, o + 1.5, fframes::svgr!(<text x="960" y="740" text-anchor="middle" font-family={SANS} font-weight="400" font-size="44" fill={MUTED}>"Then pick your mods with /plugin."</text>))}
    </g>)
}

fn outro<'a>(f: &mut Frame, ctx: &FFramesContext<'a, '_>, o: f32) -> Svgr<'a> {
    // Logo 100 px tall; its mark is ~83 px wide, so nothing sits closer than that.
    let (lw, lh) = (100.0 * 483.0 / 93.0, 100.0);
    let logo = ctx
        .get_image("composio-logo.png")
        .map_or(Svgr::empty(), |img| fframes::svgr!(<image href={img.href()} x={960.0 - lw / 2.0} y="450" width={lw} height={lh} />));
    fframes::svgr!(<g>
        {show(f, o, eyebrow(960.0, 360.0, "POWERED BY", "middle"))}
        {show(f, o + 0.1, logo)}
        {show(f, o + 0.4, fframes::svgr!(<text x="960" y="700" text-anchor="middle" font-family={MONO} font-size="44" fill={MUTED}>"claude-composio-mods"</text>))}
    </g>)
}
