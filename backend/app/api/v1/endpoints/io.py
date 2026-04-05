from typing import Any, List, Dict
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Body
from fastapi_cache import FastAPICache
from fastapi_cache.decorator import cache
from fastapi.responses import JSONResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.services.import_service import process_csv_import, preview_csv, process_rows_import
from app.models.project import Project, ProjectPlant
from app.models.plant import Plant
from app.models.taxon import Taxon

from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table,
    TableStyle, PageBreak, Image, KeepTogether, HRFlowable
)
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER
import io as _io
import re
import httpx
from urllib.parse import quote

# ── Brand Palette exact from index.css ──────────────────────────────────────
BG_CREAM     = colors.HexColor('#f4f0ea')
FG_DARK      = colors.HexColor('#1c2a1a')
PRIMARY      = colors.HexColor('#2d5a27')
SAGE         = colors.HexColor('#8aa87f')
MUTED_BG     = colors.HexColor('#e4ddd1')
MUTED_FG     = colors.HexColor('#6b7a6a')
BORDER       = colors.HexColor('#d9d2c5')
WHITE        = colors.HexColor('#ffffff')
RED_BG       = colors.HexColor('#fff1f2')
RED_BORDER   = colors.HexColor('#fecdd3')
RED_TITLE    = colors.HexColor('#b91c1c')
RED_BODY     = colors.HexColor('#881337')

router = APIRouter()


def _val(f) -> str:
    if f is None:
        return '—'
    return f.value if hasattr(f, 'value') else str(f)


# ── CSV Preview (no DB writes) ───────────────────────────────────────────────
@router.post('/import/csv/preview')
async def preview_plants_csv(file: UploadFile = File(...)) -> Any:
    """Parse the CSV and return a preview without writing anything to the database."""
    if not file.filename.endswith('.csv'):
        raise HTTPException(400, 'File must be CSV')
    content = await file.read()
    try:
        return preview_csv(content)
    except Exception as e:
        raise HTTPException(400, str(e))


# ── CSV Import ──────────────────────────────────────────────────────────────
@router.post('/import/csv')
async def import_plants_csv(file: UploadFile = File(...),
                            db: AsyncSession = Depends(get_db)) -> Any:
    if not file.filename.endswith('.csv'):
        raise HTTPException(400, 'File must be CSV')
    content = await file.read()
    try:
        result = await process_csv_import(db, content)
        await FastAPICache.clear(namespace="plants")
        await FastAPICache.clear(namespace="categories")
        await FastAPICache.clear(namespace="taxonomy")
        await FastAPICache.clear(namespace="dashboard")
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f'Import failed: {e}')

# ── JSON Rows Import (from editable preview page) ────────────────────────────
@router.post('/import/rows')
async def import_plants_rows(
    rows: List[Dict[str, str]] = Body(...),
    db: AsyncSession = Depends(get_db)
) -> Any:
    """Import plants from pre-edited JSON rows (output from the preview editor)."""
    try:
        result = await process_rows_import(db, rows)
        await FastAPICache.clear(namespace="plants")
        await FastAPICache.clear(namespace="categories")
        await FastAPICache.clear(namespace="taxonomy")
        await FastAPICache.clear(namespace="dashboard")
        return result
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f'Import failed: {e}')


# ── Image Proxy (for frontend PDF rendering, bypasses external CORS) ─────────
@router.get('/proxy/image')
async def proxy_image(url: str) -> Any:
    """Fetch an external image and return it. Used by the frontend PDF generator."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=10) as client:
            r = await client.get(url)
            if r.status_code != 200:
                raise HTTPException(502, 'Could not fetch image')
            ct = r.headers.get('content-type', 'image/jpeg')
            return Response(content=r.content, media_type=ct)
    except Exception as e:
        raise HTTPException(502, f'Image proxy error: {e}')


# ── PDF Export ──────────────────────────────────────────────────────────────
@router.get('/export/pdf/project/{project_id}')
@cache(expire=3600, namespace="projects")
async def export_project_pdf(project_id: str,
                             db: AsyncSession = Depends(get_db)) -> Any:

    # fetch project
    res = await db.execute(
        select(Project).filter(Project.id == project_id)
        .options(selectinload(Project.plants)
                 .selectinload(ProjectPlant.plant)
                 .selectinload(Plant.taxon))
    )
    project = res.scalars().first()
    if not project:
        raise HTTPException(404, 'Project not found')

    # fetch all taxons for lineage
    tr = await db.execute(select(Taxon))
    all_taxons = {t.id: t for t in tr.scalars().all()}

    def sci_name(plant: Plant) -> str:
        if plant.scientific_name:
            return plant.scientific_name
        if not plant.taxon:
            return 'Unknown Species'
        lin, curr = [], plant.taxon
        while curr:
            lin.append(curr)
            curr = all_taxons.get(curr.parent_id) if curr.parent_id else None
        genus = next((t.name for t in lin if _val(t.rank).lower() == 'genus'), None)
        if genus and _val(plant.taxon.rank).lower() == 'species':
            return f'{genus} {plant.taxon.name}'
        return plant.taxon.name

    def lineage(taxon_id):
        if not taxon_id:
            return []
        result, curr = [], all_taxons.get(taxon_id)
        while curr:
            result.insert(0, (_val(curr.rank).upper(), curr.name))
            curr = all_taxons.get(curr.parent_id) if curr.parent_id else None
        return result

    async def fetch(url):
        if not url:
            return None
        try:
            async with httpx.AsyncClient() as c:
                r = await c.get(url, timeout=6)
                if r.status_code == 200:
                    return _io.BytesIO(r.content)
        except Exception:
            pass
        return None

    # ── Styles ───────────────────────────────────────────────────────────────
    B = getSampleStyleSheet()

    def sty(name, **kw):
        return ParagraphStyle(name, parent=B['Normal'], **kw)

    ST = dict(
        proj_title  = sty('pt',  fontSize=32, textColor=FG_DARK,    fontName='Helvetica-Bold', spaceAfter=4,  leading=36),
        proj_meta   = sty('pm',  fontSize=11, textColor=MUTED_FG,   fontName='Helvetica',      spaceAfter=3,  leading=15),
        proj_desc   = sty('pd',  fontSize=10, textColor=MUTED_FG,                              spaceAfter=4,  leading=16),
        sec_h       = sty('sh',  fontSize=17, textColor=PRIMARY,     fontName='Helvetica-Bold', spaceBefore=16,spaceAfter=8),
        lbl_up      = sty('lu',  fontSize=7,  textColor=MUTED_FG,   fontName='Helvetica-Bold', leading=10),
        tbl_hd      = sty('th',  fontSize=10, textColor=PRIMARY,     fontName='Helvetica-Bold'),
        tbl_lk      = sty('tl',  fontSize=10, textColor=PRIMARY,     fontName='Helvetica-Bold', leading=14),
        tbl_sc      = sty('ts',  fontSize=10, textColor=MUTED_FG,   fontName='Helvetica-Oblique', leading=14),
        tbl_bd      = sty('tb',  fontSize=10, textColor=FG_DARK,                               leading=14),
        pl_name     = sty('pn',  fontSize=28, textColor=FG_DARK,     fontName='Helvetica-Bold', spaceAfter=2,  leading=32),
        pl_sci      = sty('ps',  fontSize=12, textColor=MUTED_FG,   fontName='Helvetica-Oblique', spaceAfter=8, leading=15),
        pill        = sty('pil', fontSize=8,  textColor=MUTED_FG,   fontName='Helvetica-Bold', leading=10),
        card_h      = sty('ch',  fontSize=11, textColor=FG_DARK,     fontName='Helvetica-Bold', spaceAfter=3,  leading=14),
        card_b      = sty('cb',  fontSize=9,  textColor=MUTED_FG,                              leading=14),
        care_k      = sty('ck',  fontSize=8,  textColor=FG_DARK,     fontName='Helvetica-Bold', leading=11),
        care_v      = sty('cv',  fontSize=9,  textColor=MUTED_FG,                              leading=14),
        note        = sty('no',  fontSize=9,  textColor=FG_DARK,                               leading=14),
        tax_rank    = sty('tr',  fontSize=8,  textColor=MUTED_FG,   fontName='Helvetica-Bold', leading=10),
        tax_name    = sty('tn',  fontSize=10, textColor=FG_DARK,                               leading=14, alignment=TA_RIGHT),
        red_h       = sty('rh',  fontSize=11, textColor=RED_TITLE,   fontName='Helvetica-Bold', spaceAfter=3,  leading=14),
        red_b       = sty('rb',  fontSize=9,  textColor=RED_BODY,                              leading=14),
    )

    def S(key):
        return ST[key]

    # helper: build a styled card table from a list of [Paragraph | Table | Spacer]
    def make_card(rows, bg=WHITE, border=BORDER, pad=10, width=None):
        """Wrap flowables in a rounded-ish card. Returns a Table."""
        data = [[r] for r in rows]
        cw = [width] if width else [None]
        t = Table(data, colWidths=cw)
        t.setStyle(TableStyle([
            ('BACKGROUND',    (0, 0), (-1, -1), bg),
            ('BOX',           (0, 0), (-1, -1), 0.5,  border),
            ('TOPPADDING',    (0, 0), (-1, -1), pad),
            ('BOTTOMPADDING', (0, 0), (-1, -1), pad),
            ('LEFTPADDING',   (0, 0), (-1, -1), pad),
            ('RIGHTPADDING',  (0, 0), (-1, -1), pad),
            ('VALIGN',        (0, 0), (-1, -1), 'TOP'),
        ]))
        return t

    def hr(color=BORDER):
        return HRFlowable(width='100%', thickness=0.5, color=color,
                          spaceAfter=8, spaceBefore=4)

    # ── Build document ───────────────────────────────────────────────────────
    buf = _io.BytesIO()

    def bg(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(BG_CREAM)
        canvas.rect(0, 0, 8.5*inch, 11*inch, fill=1, stroke=0)
        canvas.restoreState()

    PAGE_W = 7.5 * inch   # usable (8.5 - 0.5*2 margins)

    doc = SimpleDocTemplate(
        buf, pagesize=letter,
        leftMargin=0.5*inch, rightMargin=0.5*inch,
        topMargin=0.5*inch,  bottomMargin=0.5*inch,
        title=f'{project.name} — Plant Report'
    )

    story = []

    # ═══════════════════════════════════════════════════════════════════════
    # COVER PAGE — project info + inventory table
    # ═══════════════════════════════════════════════════════════════════════
    story.append(Paragraph(project.name, S('proj_title')))
    if project.client_name:
        story.append(Paragraph(f'Client: {project.client_name}', S('proj_meta')))
    if project.location:
        story.append(Paragraph(f'Location: {project.location}', S('proj_meta')))
    if project.description:
        story.append(Spacer(1, 4))
        story.append(Paragraph(project.description, S('proj_desc')))
    story.append(HRFlowable(width='100%', thickness=1.5, color=PRIMARY,
                             spaceBefore=12, spaceAfter=16))
    story.append(Paragraph('Project Inventory', S('sec_h')))

    cats: dict[str, list] = {}
    for pp in project.plants:
        if pp.plant:
            cats.setdefault(_val(pp.plant.category), []).append(pp)

    if not cats:
        story.append(Paragraph('No plants in this project.', S('tbl_bd')))
    else:
        idx = 1
        for cat, pps in sorted(cats.items()):
            story.append(Spacer(1, 6))
            story.append(Paragraph(cat.upper(), S('lbl_up')))
            story.append(Spacer(1, 4))

            rows = [[Paragraph(h, S('tbl_hd')) for h in
                     ['#', 'Common Name', 'Scientific Name', 'Notes']]]
            for pp in pps:
                p = pp.plant
                rows.append([
                    Paragraph(str(idx), S('tbl_bd')),
                    Paragraph(f'<link href="#plant_{p.id}"><font color="#2d5a27"><b>'
                              f'{p.common_name or "—"}</b></font></link>', S('tbl_lk')),
                    Paragraph(f'<i>{sci_name(p)}</i>', S('tbl_sc')),
                    Paragraph(pp.notes or '—', S('tbl_bd')),
                ])
                idx += 1

            cols = [0.35*inch, 1.9*inch, 2.1*inch, 3.15*inch]
            t = Table(rows, colWidths=cols, repeatRows=1)
            t.setStyle(TableStyle([
                ('BACKGROUND',    (0, 0), (-1, 0), MUTED_BG),
                ('LINEBELOW',     (0, 0), (-1, 0), 1.5, PRIMARY),
                ('TOPPADDING',    (0, 0), (-1, 0), 8),
                ('BOTTOMPADDING', (0, 0), (-1, 0), 8),
                ('ROWBACKGROUNDS',(0, 1), (-1,-1), [WHITE, BG_CREAM]),
                ('TOPPADDING',    (0, 1), (-1,-1), 6),
                ('BOTTOMPADDING', (0, 1), (-1,-1), 6),
                ('LEFTPADDING',   (0, 0), (-1,-1), 8),
                ('RIGHTPADDING',  (0, 0), (-1,-1), 8),
                ('VALIGN',        (0, 0), (-1,-1), 'TOP'),
                ('BOX',           (0, 0), (-1,-1), 0.5, BORDER),
                ('INNERGRID',     (0, 0), (-1,-1), 0.25, BORDER),
            ]))
            story.append(t)
            story.append(Spacer(1, 12))

    # ═══════════════════════════════════════════════════════════════════════
    # PLANT DETAIL PAGES
    # Each plant gets its own page, layout mirrors PlantDetails.tsx:
    #   Header: icon + name + sci + pills on left, hero image on right
    #   Body:   Description card + Care 2x2 grid  |  Diseases + Taxonomy
    # ═══════════════════════════════════════════════════════════════════════
    MAIN_W = 4.5 * inch
    SIDE_W = PAGE_W - MAIN_W - 0.15 * inch

    for pp in project.plants:
        p = pp.plant
        if not p:
            continue

        story.append(PageBreak())

        anchor    = f'plant_{p.id}'
        sc        = sci_name(p)
        img_data  = await fetch(p.image_url)
        icon_data = await fetch(p.icon_url)

        # ── HEADER ROW ──────────────────────────────────────────────────
        # Left: [icon] [name + sci] + pills
        # Right: hero image
        name_block = [
            Paragraph(f'<a name="{anchor}"/>{p.common_name}', S('pl_name')),
            Paragraph(f'<i>{sc}</i>', S('pl_sci')),
        ]

        if icon_data:
            try:
                ico = Image(icon_data)
                ico.drawWidth = ico.drawHeight = 0.6 * inch
                name_inner = Table([[ico, name_block]],
                                   colWidths=[0.75*inch, 2.8*inch])
                name_inner.setStyle(TableStyle([
                    ('VALIGN',        (0,0),(-1,-1),'MIDDLE'),
                    ('LEFTPADDING',   (0,0),(-1,-1),0),
                    ('RIGHTPADDING',  (0,0),(-1,-1),0),
                    ('TOPPADDING',    (0,0),(-1,-1),0),
                    ('BOTTOMPADDING', (0,0),(-1,-1),0),
                ]))
                hdr_left_top = [name_inner]
            except Exception:
                hdr_left_top = [Paragraph(f'<a name="{anchor}"/>{p.common_name}', S('pl_name')),
                                 Paragraph(f'<i>{sc}</i>', S('pl_sci'))]
        else:
            hdr_left_top = name_block

        # Pill badges
        cat_pill   = _val(p.category).upper()
        place_pill = _val(p.planting_place).upper()
        pill_tbl = Table(
            [[Paragraph(f' {cat_pill} ', S('pill')),
              Spacer(6, 1),
              Paragraph(f' {place_pill} ', S('pill'))]],
            colWidths=[1.1*inch, 0.1*inch, 1.1*inch]
        )
        pill_tbl.setStyle(TableStyle([
            ('BACKGROUND',    (0,0),(0,0), MUTED_BG),
            ('BACKGROUND',    (2,0),(2,0), MUTED_BG),
            ('TOPPADDING',    (0,0),(-1,-1), 4),
            ('BOTTOMPADDING', (0,0),(-1,-1), 4),
            ('LEFTPADDING',   (0,0),(-1,-1), 8),
            ('RIGHTPADDING',  (0,0),(-1,-1), 8),
            ('VALIGN',        (0,0),(-1,-1), 'MIDDLE'),
        ]))
        hdr_left_top.append(Spacer(1, 6))
        hdr_left_top.append(pill_tbl)

        # Hero image (right column of header)
        hdr_right = []
        if img_data:
            try:
                hero = Image(img_data)
                max_h, max_w = 2.6*inch, SIDE_W
                ratio = hero.imageHeight / max(hero.imageWidth, 1)
                hero.drawWidth  = min(max_w, max_h / max(ratio, 0.001))
                hero.drawHeight = hero.drawWidth * ratio
                if hero.drawHeight > max_h:
                    hero.drawHeight = max_h
                    hero.drawWidth  = max_h / max(ratio, 0.001)
                hdr_right.append(hero)
            except Exception:
                pass

        hdr_tbl = Table([[hdr_left_top, hdr_right]],
                        colWidths=[MAIN_W, SIDE_W])
        hdr_tbl.setStyle(TableStyle([
            ('VALIGN',        (0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
            ('TOPPADDING',    (0,0),(-1,-1), 0),
            ('BOTTOMPADDING', (0,0),(-1,-1), 0),
            ('ALIGN',         (1,0),(1,0),  'RIGHT'),
        ]))
        story.append(hdr_tbl)
        story.append(Spacer(1, 14))

        # ── DESCRIPTION CARD (main col) ──────────────────────────────────
        desc_rows = [
            Paragraph('Description', S('card_h')),
            hr(),
            Paragraph(p.description or 'No description provided.', S('card_b')),
        ]
        if pp.notes:
            desc_rows += [
                Spacer(1, 8),
                Paragraph('Project Notes', S('card_h')),
                hr(),
                Paragraph(pp.notes, S('note')),
            ]
        desc_card = make_card(desc_rows, width=MAIN_W - 0.1)

        # ── CARE DATA 2×2 GRID (main col) ───────────────────────────────
        care_card = None
        if p.care_data:
            icon_map = {'water':'💧','sun':'☀','soil':'≡','maintenance':'⚙',
                        'fertilizer':'⬡','humidity':'💦','temperature':'🌡',
                        'pruning':'✂','light':'☀'}
            cells = []
            for k, v in p.care_data.items():
                if not v:
                    continue
                ico = next((ic for kw, ic in icon_map.items() if kw in k.lower()), '•')
                label = f'{ico}  {k.replace("_"," ").upper()}'
                cell_inner = Table(
                    [[Paragraph(label, S('care_k'))],
                     [Paragraph(str(v), S('care_v'))]],
                    colWidths=[None]
                )
                cell_inner.setStyle(TableStyle([
                    ('BACKGROUND',    (0,0),(-1,-1), MUTED_BG),
                    ('TOPPADDING',    (0,0),(-1,-1), 8),
                    ('BOTTOMPADDING', (0,0),(-1,-1), 8),
                    ('LEFTPADDING',   (0,0),(-1,-1), 8),
                    ('RIGHTPADDING',  (0,0),(-1,-1), 8),
                    ('VALIGN',        (0,0),(-1,-1), 'TOP'),
                ]))
                cells.append(cell_inner)

            if cells:
                half = (MAIN_W - 0.1 - 20 - 6) / 2   # card pad=10 each side, gap=6
                grid_rows = []
                for i in range(0, len(cells), 2):
                    pair = cells[i:i+2]
                    if len(pair) == 1:
                        pair.append('')
                    grid_rows.append(pair)
                grid_tbl = Table(grid_rows, colWidths=[half, half])
                grid_tbl.setStyle(TableStyle([
                    ('VALIGN',        (0,0),(-1,-1),'TOP'),
                    ('LEFTPADDING',   (0,0),(-1,-1), 3),
                    ('RIGHTPADDING',  (0,0),(-1,-1), 3),
                    ('TOPPADDING',    (0,0),(-1,-1), 3),
                    ('BOTTOMPADDING', (0,0),(-1,-1), 3),
                ]))
                care_card = make_card(
                    [Paragraph('Care Data', S('card_h')), hr(), grid_tbl],
                    width=MAIN_W - 0.1
                )

        # ── DISEASES CARD (side col, red) ────────────────────────────────
        disease_card = None
        if p.common_diseases:
            disease_card = make_card(
                [Paragraph('Common Diseases & Pests', S('red_h')),
                 HRFlowable(width='100%', thickness=0.5, color=RED_BORDER,
                            spaceAfter=8, spaceBefore=4),
                 Paragraph(p.common_diseases, S('red_b'))],
                bg=RED_BG, border=RED_BORDER, width=SIDE_W - 0.1
            )

        # ── TAXONOMY CARD (side col, white) ──────────────────────────────
        tax_card = None
        lin = lineage(p.taxon_id)
        if lin:
            RW = SIDE_W - 0.1 - 20  # card pad=10 each side
            tax_items = [Paragraph('Taxonomy Lineage', S('card_h')), hr()]
            for i, (rank, name) in enumerate(lin):
                row_t = Table(
                    [[Paragraph(rank, S('tax_rank')),
                      Paragraph(name, S('tax_name'))]],
                    colWidths=[0.85*inch, RW - 0.85*inch]
                )
                style = [
                    ('VALIGN',        (0,0),(-1,-1),'MIDDLE'),
                    ('TOPPADDING',    (0,0),(-1,-1), 5),
                    ('BOTTOMPADDING', (0,0),(-1,-1), 5),
                    ('LEFTPADDING',   (0,0),(-1,-1), 0),
                    ('RIGHTPADDING',  (0,0),(-1,-1), 0),
                ]
                if i < len(lin) - 1:
                    style.append(('LINEBELOW', (0,0),(-1,-1), 0.5, BORDER))
                row_t.setStyle(TableStyle(style))
                tax_items.append(row_t)
            tax_card = make_card(tax_items, width=SIDE_W - 0.1)

        # ── ASSEMBLE BODY AS FLAT ROWS ────────────────────────────────────
        # To avoid LayoutError from overly tall cells, we pair items row-by-row
        # Each body row is [main_item, side_item] — either can be empty string.
        main_items = [desc_card]
        if care_card:
            main_items.append(care_card)

        side_items = []
        if disease_card:
            side_items.append(disease_card)
        if tax_card:
            side_items.append(tax_card)

        # Pad to same length
        max_len = max(len(main_items), len(side_items))
        main_items += [''] * (max_len - len(main_items))
        side_items += [''] * (max_len - len(side_items))

        # Insert spacers between rows as separate entries
        body_rows = []
        for i, (m, s) in enumerate(zip(main_items, side_items)):
            body_rows.append([m, s])
            if i < max_len - 1:
                body_rows.append([Spacer(1, 8), Spacer(1, 8)])

        body_tbl = Table(body_rows, colWidths=[MAIN_W, SIDE_W])
        body_tbl.setStyle(TableStyle([
            ('VALIGN',        (0,0),(-1,-1),'TOP'),
            ('LEFTPADDING',   (0,0),(-1,-1), 0),
            ('RIGHTPADDING',  (0,0),(-1,-1), 0),
            ('TOPPADDING',    (0,0),(-1,-1), 0),
            ('BOTTOMPADDING', (0,0),(-1,-1), 0),
            ('LEFTPADDING',   (1,0),(1,-1),  10),
        ]))
        story.append(body_tbl)

    # ── Render ───────────────────────────────────────────────────────────────
    doc.build(story, onFirstPage=bg, onLaterPages=bg)
    buf.seek(0)

    safe    = re.sub(r'[\\/*?"<>|]', '', project.name).encode('ascii', 'ignore').decode()
    encoded = quote(project.name, safe=' ()')
    cd = f'attachment; filename="{safe}.pdf"; filename*=UTF-8\'\'{encoded}.pdf'

    return Response(
        content=buf.getvalue(),
        media_type='application/pdf',
        headers={'Content-Disposition': cd},
    )
