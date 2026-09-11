from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    HRFlowable,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "upwork-solomindlm-product-brief.pdf"


# SolomindLM light theme tokens, adapted from apps/web/src/index.css.
NAVY = colors.HexColor("#74573E")
TEAL = colors.HexColor("#3F7553")
INK = colors.HexColor("#302D27")
MUTED = colors.HexColor("#806E5D")
PALE = colors.HexColor("#F9F3E7")
LINE = colors.HexColor("#D8C9B9")
PAGE_BG = colors.HexColor("#FDFBF7")


styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="BriefTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=25,
        leading=28,
        textColor=colors.white,
        alignment=TA_LEFT,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="BriefSubtitle",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#F5EDE1"),
    )
)
styles.add(
    ParagraphStyle(
        name="Kicker",
        parent=styles["Normal"],
        fontName="Helvetica-Bold",
        fontSize=8.5,
        leading=10,
        textColor=TEAL,
        uppercase=True,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="Section",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=12.5,
        leading=15,
        textColor=NAVY,
        spaceBefore=0,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="BodyBrief",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.3,
        leading=12.4,
        textColor=INK,
        spaceAfter=5,
    )
)
styles.add(
    ParagraphStyle(
        name="SmallBrief",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.6,
        leading=11.2,
        textColor=INK,
        spaceAfter=3,
    )
)
styles.add(
    ParagraphStyle(
        name="FooterBrief",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=8.5,
        leading=10,
        textColor=MUTED,
        alignment=TA_LEFT,
    )
)


def p(text, style="BodyBrief"):
    return Paragraph(text, styles[style])


def bullets(items):
    return [
        Paragraph(f"- {item}", ParagraphStyle(
            name=f"Bullet{index}",
            parent=styles["SmallBrief"],
            leftIndent=7,
            firstLineIndent=-7,
        ))
        for index, item in enumerate(items)
    ]


def section(title, body):
    return [p(title, "Section"), *body]


def header_footer(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(PAGE_BG)
    canvas.rect(0, 0, letter[0], letter[1], fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(0.55 * inch, 0.44 * inch, 7.95 * inch, 0.44 * inch)
    canvas.setFont("Helvetica", 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(0.55 * inch, 0.27 * inch, "SolomindLM | Product overview for short-form video editing")
    canvas.drawRightString(7.95 * inch, 0.27 * inch, "solomindlm.com")
    canvas.restoreState()


doc = BaseDocTemplate(
    str(OUTPUT),
    pagesize=letter,
    leftMargin=0.55 * inch,
    rightMargin=0.55 * inch,
    topMargin=0.45 * inch,
    bottomMargin=0.58 * inch,
    title="SolomindLM Product Brief",
    author="SolomindLM",
)
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="normal")
doc.addPageTemplates([PageTemplate(id="brief", frames=frame, onPage=header_footer)])

story = []
story.append(
    Table(
        [[
            [
                p("SolomindLM", "BriefTitle"),
                p("Product context for short-form video editors", "BriefSubtitle"),
            ]
        ]],
        colWidths=[doc.width],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), NAVY),
            ("LEFTPADDING", (0, 0), (-1, -1), 17),
            ("RIGHTPADDING", (0, 0), (-1, -1), 17),
            ("TOPPADDING", (0, 0), (-1, -1), 14),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
        ]),
    )
)
story.append(Spacer(1, 10))
story.append(p("FREE TO START  |  <link href='https://solomindlm.com' color='#3F7553'>solomindlm.com</link>", "Kicker"))
story.append(
    p(
        "SolomindLM is a free AI study and research notebook. Users upload lectures, PDFs, slides, notes, or research papers, then work directly from those materials instead of relying only on generic AI knowledge."
    )
)
story.append(Spacer(1, 4))

left = section(
    "The product story",
    [
        p(
            "SolomindLM helps people move from a pile of source material to a more useful learning or research workflow. Users can ask questions about their materials and receive answers with citations, then turn those materials into practical study outputs.",
            "SmallBrief",
        ),
        p("<b>For students</b>", "SmallBrief"),
        p(
            "Turn lectures, slides, and notes into editable flashcards, quizzes, and written practice questions.",
            "SmallBrief",
        ),
    ],
)
right = section(
    "For researchers",
    [
        bullets([
            "Ask questions across a reading list of papers.",
            "Create literature-review syntheses with formatted citations, including APA, MLA, and Chicago styles.",
            "Check the underlying sources instead of treating an AI answer as unquestionable.",
        ]),
        p("<b>Who it is for</b>", "SmallBrief"),
        p(
            "Students, learners, graduate students, and researchers who need a faster way to understand and work across their sources.",
            "SmallBrief",
        ),
    ],
)
columns = Table([[left, right]], colWidths=[doc.width * 0.49, doc.width * 0.49], hAlign="LEFT")
columns.setStyle(
    TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("LINEBEFORE", (1, 0), (1, 0), 0.5, LINE),
        ("LEFTPADDING", (1, 0), (1, 0), 12),
    ])
)
story.append(columns)
story.append(Spacer(1, 7))
story.append(
    Table(
        [[
            [
                p("SHORT-FORM EDITING DIRECTION", "Kicker"),
                bullets([
                    "Use a format-first approach: POVs, skits, reactions, before-and-after videos, voiceovers, and screen-recording demos.",
                    "Prioritize a strong opening hook and make the value clear quickly.",
                    "Test multiple hooks or openings for promising concepts.",
                    "Remove dead space and keep the pacing energetic without feeling chaotic.",
                    "Use captions, zooms, cuts, sound design, and motion graphics when they improve understanding.",
                    "Make the product interface easy to follow on a phone screen.",
                    "Help identify repeatable formats and improve them using watch time, completion, saves, shares, and clicks.",
                ]),
            ]
        ]],
        colWidths=[doc.width],
        style=TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), PALE),
            ("BOX", (0, 0), (-1, -1), 0.5, colors.HexColor("#D8C9B9")),
            ("LEFTPADDING", (0, 0), (-1, -1), 12),
            ("RIGHTPADDING", (0, 0), (-1, -1), 12),
            ("TOPPADDING", (0, 0), (-1, -1), 9),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ]),
    )
)
story.append(Spacer(1, 7))

left = section(
    "What we can provide",
    [
        bullets([
            "Product access and screen recordings.",
            "Walkthroughs, source material, rough voiceovers, and creative direction.",
            "Feedback on drafts and the product details that must remain accurate.",
        ])
    ],
)
right = section(
    "Scope note",
    [
        p(
            "This is an editing and post-production role. Account management, community management, paid advertising, and appearing on camera are not required. Voiceover, screen recording, text-led, hands-only, avatar, and other faceless formats are welcome.",
            "SmallBrief",
        )
    ],
)
columns = Table([[left, right]], colWidths=[doc.width * 0.49, doc.width * 0.49], hAlign="LEFT")
columns.setStyle(
    TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (1, 0), (1, 0), 0),
        ("LINEBEFORE", (1, 0), (1, 0), 0.5, LINE),
        ("LEFTPADDING", (1, 0), (1, 0), 12),
    ])
)
story.append(columns)
story.append(Spacer(1, 4))
story.append(p("STYLE", "Kicker"))
story.append(
    p(
        "Finished videos should feel useful, clear, credible, and native to short-form platforms. A relatable problem, a strong hook, and a satisfying product demonstration matter more than a heavily scripted advertisement. Content can be bold and surprising, but it must remain accurate. We are not looking for misleading product claims or controversy for its own sake.",
        "SmallBrief",
    )
)
story.append(HRFlowable(width="100%", thickness=0.5, color=LINE, spaceBefore=2, spaceAfter=5))
story.append(p("Website: <link href='https://solomindlm.com' color='#3F7553'>solomindlm.com</link>", "FooterBrief"))

doc.build(story)
print(OUTPUT)
