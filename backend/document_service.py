import os
import sys
import uuid
import datetime
import qrcode
from io import BytesIO
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm, inch
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as RLImage, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY

# Base directories
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
UPLOAD_DIR = os.path.join(BASE_DIR, 'uploads', 'documents')
os.makedirs(UPLOAD_DIR, exist_ok=True)
QR_DIR = os.path.join(UPLOAD_DIR, 'qr')
os.makedirs(QR_DIR, exist_ok=True)
ASSETS_DIR = os.path.join(BASE_DIR, 'assets')

# ===================================================================
# 1. AMOUNT IN WORDS (INDIAN NUMBERING SYSTEM)
# ===================================================================
ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
        "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
        "Seventeen", "Eighteen", "Nineteen"]
TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]

def _two_digits_to_words(n):
    if n == 0:
        return ""
    if n < 20:
        return ONES[n]
    tens = TENS[n // 10]
    ones = ONES[n % 10]
    return f"{tens} {ones}".strip()

def _three_digits_to_words(n):
    words = ""
    hundreds = n // 100
    remainder = n % 100
    if hundreds > 0:
        words += f"{ONES[hundreds]} Hundred"
        if remainder > 0:
            words += " and "
    if remainder > 0:
        words += _two_digits_to_words(remainder)
    return words.strip()

def number_to_words_inr(amount):
    """
    Converts a float/decimal number into Indian Rupees text.
    E.g. 25500.50 -> 'Rupees Twenty-Five Thousand Five Hundred and Fifty Paise Only'
    """
    try:
        amount = float(amount)
    except (ValueError, TypeError):
        return "Rupees Zero Only"

    if amount < 0:
        return "Negative " + number_to_words_inr(abs(amount))
    if amount == 0:
        return "Rupees Zero Only"

    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))

    if rupees == 0 and paise > 0:
        return f"{_two_digits_to_words(paise)} Paise Only"

    crores = rupees // 10000000
    rupees %= 10000000

    lakhs = rupees // 100000
    rupees %= 100000

    thousands = rupees // 1000
    rupees %= 1000

    parts = []
    if crores > 0:
        parts.append(f"{_three_digits_to_words(crores)} Crore")
    if lakhs > 0:
        parts.append(f"{_two_digits_to_words(lakhs)} Lakh")
    if thousands > 0:
        parts.append(f"{_two_digits_to_words(thousands)} Thousand")
    if rupees > 0:
        parts.append(_three_digits_to_words(rupees))

    rupees_str = " ".join(parts).strip()
    result = f"Rupees {rupees_str}"

    if paise > 0:
        paise_str = _two_digits_to_words(paise)
        result += f" and {paise_str} Paise"

    return f"{result} Only"


# ===================================================================
# 2. QR CODE GENERATOR
# ===================================================================
def generate_document_qr(verify_url, identifier):
    """
    Generates a secure QR code image for verification and returns the file path.
    """
    qr = qrcode.QRCode(
        version=1,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=6,
        border=2,
    )
    qr.add_data(verify_url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#060c18", back_color="#ffffff")
    
    clean_id = identifier.replace("/", "_").replace("-", "_")
    qr_filename = f"qr_{clean_id}_{uuid.uuid4().hex[:6]}.png"
    qr_path = os.path.join(QR_DIR, qr_filename)
    img.save(qr_path)
    return qr_path


# ===================================================================
# 3. REPORTLAB INVOICE PDF GENERATOR
# ===================================================================
def generate_invoice_pdf(invoice_data, items_data, qr_image_path=None):
    """
    Builds a vector-sharp, professional GST Tax Invoice PDF matching A4 standard.
    """
    inv_num = invoice_data.get('invoice_number', 'TC-INV-2026-000001')
    clean_num = inv_num.replace('/', '_').replace('-', '_')
    pdf_filename = f"invoice_{clean_num}_{uuid.uuid4().hex[:8]}.pdf"
    pdf_path = os.path.join(UPLOAD_DIR, pdf_filename)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm
    )

    styles = getSampleStyleSheet()
    
    # Custom Palette
    COLOR_PRIMARY = colors.HexColor("#060c18")
    COLOR_CYAN = colors.HexColor("#008fa0")
    COLOR_ACCENT = colors.HexColor("#0f172a")
    COLOR_TEXT = colors.HexColor("#1e293b")
    COLOR_MUTED = colors.HexColor("#64748b")
    COLOR_LIGHT = colors.HexColor("#f8fafc")
    COLOR_BORDER = colors.HexColor("#cbd5e1")

    # Typography styles
    style_title = ParagraphStyle('InvTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=COLOR_PRIMARY)
    style_subtitle = ParagraphStyle('InvSubTitle', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=COLOR_CYAN)
    style_heading = ParagraphStyle('InvHeading', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=9, leading=11, textColor=COLOR_ACCENT)
    style_body = ParagraphStyle('InvBody', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10.5, textColor=COLOR_TEXT)
    style_body_bold = ParagraphStyle('InvBodyBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10.5, textColor=COLOR_TEXT)
    style_small = ParagraphStyle('InvSmall', parent=styles['Normal'], fontName='Helvetica', fontSize=7, leading=9, textColor=COLOR_MUTED)
    style_right = ParagraphStyle('InvRight', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10.5, textColor=COLOR_TEXT, alignment=TA_RIGHT)
    style_right_bold = ParagraphStyle('InvRightBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10.5, textColor=COLOR_TEXT, alignment=TA_RIGHT)
    style_table_header = ParagraphStyle('InvTH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.white, alignment=TA_CENTER)
    style_table_cell = ParagraphStyle('InvTC', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=COLOR_TEXT)
    style_table_cell_r = ParagraphStyle('InvTCR', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=COLOR_TEXT, alignment=TA_RIGHT)

    story = []

    # 1. Top Header Row (Logo / Brand + Title + Meta)
    logo_path = os.path.join(ASSETS_DIR, 'logo.png')
    logo_flowable = None
    if os.path.exists(logo_path):
        try:
            logo_flowable = RLImage(logo_path, width=42*mm, height=12*mm)
        except Exception:
            logo_flowable = Paragraph("<b>TRANCECONNECT-PRIME</b>", style_title)
    else:
        logo_flowable = Paragraph("<font color='#008fa0'>◆</font> <b>TRANCECONNECT-PRIME</b>", style_title)

    header_left = [
        logo_flowable,
        Spacer(1, 1*mm),
        Paragraph("Next-Gen Commercial Logistics & Transit Network", style_subtitle)
    ]

    header_right = [
        Paragraph("<b>TAX INVOICE</b>", ParagraphStyle('TaxInvH', parent=style_title, fontSize=16, alignment=TA_RIGHT, textColor=COLOR_CYAN)),
        Paragraph(f"<b>Invoice No:</b> {inv_num}", style_right_bold),
        Paragraph(f"<b>Date:</b> {invoice_data.get('invoice_date', '')}", style_right),
        Paragraph(f"<b>Due Date:</b> {invoice_data.get('due_date', 'Upon Delivery')}", style_right),
        Paragraph(f"<b>Place of Supply:</b> {invoice_data.get('place_of_supply', invoice_data.get('buyer_state', 'Maharashtra'))}", style_right)
    ]

    header_table = Table([[header_left, header_right]], colWidths=[95*mm, 91*mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4*mm),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceAfter=3*mm))

    # 2. Seller and Buyer 2-Column Panel
    seller_html = f"""
    <b>SOLD BY / CONSIGNOR:</b><br/>
    <b>{invoice_data.get('seller_company', '')}</b><br/>
    {invoice_data.get('seller_address', '')}<br/>
    <b>GSTIN:</b> {invoice_data.get('seller_gst', 'N/A')}<br/>
    <b>State:</b> {invoice_data.get('seller_state', '')} (Code: {invoice_data.get('seller_state_code', '27')})<br/>
    <b>Phone:</b> {invoice_data.get('seller_mobile', '')} | <b>Email:</b> {invoice_data.get('seller_email', '')}
    """

    buyer_html = f"""
    <b>BILLED TO / BUYER:</b><br/>
    <b>{invoice_data.get('buyer_company', '')}</b><br/>
    <b>Attn:</b> {invoice_data.get('buyer_name', 'Authorized Representative')}<br/>
    {invoice_data.get('buyer_address', '')}<br/>
    <b>GSTIN:</b> {invoice_data.get('buyer_gst', 'Unregistered')}<br/>
    <b>State:</b> {invoice_data.get('buyer_state', '')} (Code: {invoice_data.get('buyer_state_code', '')})<br/>
    <b>Phone:</b> {invoice_data.get('buyer_mobile', '')}
    """

    party_table = Table([[
        Paragraph(seller_html, style_body),
        Paragraph(buyer_html, style_body)
    ]], colWidths=[93*mm, 93*mm])
    party_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), COLOR_LIGHT),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (0,0), 0.5, COLOR_BORDER),
        ('BOX', (1,0), (1,0), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2.5*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 3*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 3*mm),
    ]))
    story.append(party_table)
    story.append(Spacer(1, 2.5*mm))

    # Shipment & Transit Details Bar
    ship_id = invoice_data.get('shipment_id')
    veh_num = invoice_data.get('vehicle_number', 'Allocated Fleet Truck')
    terms = invoice_data.get('payment_terms', 'Net 30 Days')
    trans_info = f"<b>Transit Ref:</b> #SHP-{ship_id if ship_id else 'Direct Load'} &bull; <b>Vehicle No:</b> {veh_num} &bull; <b>Payment Terms:</b> {terms}"
    transit_table = Table([[Paragraph(trans_info, style_body)]], colWidths=[186*mm])
    transit_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#e2e8f0")),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 1.5*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1.5*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 3*mm),
    ]))
    story.append(transit_table)
    story.append(Spacer(1, 3*mm))

    # 3. Itemized Products Table
    is_interstate = float(invoice_data.get('igst_amount', 0.0)) > 0.0

    if is_interstate:
        table_headers = [
            Paragraph("#", style_table_header),
            Paragraph("Item Description", style_table_header),
            Paragraph("HSN/SAC", style_table_header),
            Paragraph("Qty", style_table_header),
            Paragraph("Unit", style_table_header),
            Paragraph("Rate (₹)", style_table_header),
            Paragraph("Taxable (₹)", style_table_header),
            Paragraph("IGST %", style_table_header),
            Paragraph("Total (₹)", style_table_header)
        ]
        col_widths = [8*mm, 52*mm, 18*mm, 14*mm, 14*mm, 20*mm, 22*mm, 16*mm, 22*mm]
    else:
        table_headers = [
            Paragraph("#", style_table_header),
            Paragraph("Item Description", style_table_header),
            Paragraph("HSN/SAC", style_table_header),
            Paragraph("Qty", style_table_header),
            Paragraph("Unit", style_table_header),
            Paragraph("Rate (₹)", style_table_header),
            Paragraph("Taxable (₹)", style_table_header),
            Paragraph("CGST+SGST", style_table_header),
            Paragraph("Total (₹)", style_table_header)
        ]
        col_widths = [8*mm, 50*mm, 18*mm, 14*mm, 14*mm, 20*mm, 22*mm, 18*mm, 22*mm]

    item_rows = [table_headers]
    for idx, item in enumerate(items_data, 1):
        rate = float(item.get('rate', 0.0))
        taxable = float(item.get('taxable_value', 0.0))
        tot = float(item.get('total', 0.0))
        gst_pct = float(item.get('gst_rate', 18.0))

        if is_interstate:
            tax_col_text = f"{gst_pct:.1f}%"
        else:
            tax_col_text = f"{gst_pct/2:.1f}%+{gst_pct/2:.1f}%"

        desc_p = Paragraph(f"<b>{item.get('item_name', '')}</b><br/><font color='#64748b'>{item.get('description', '')}</font>", style_table_cell)

        item_rows.append([
            Paragraph(str(idx), style_table_cell),
            desc_p,
            Paragraph(item.get('hsn_sac', '996511'), style_table_cell),
            Paragraph(f"{float(item.get('quantity', 1)):.2f}", style_table_cell_r),
            Paragraph(item.get('unit', 'Tons'), style_table_cell),
            Paragraph(f"{rate:,.2f}", style_table_cell_r),
            Paragraph(f"{taxable:,.2f}", style_table_cell_r),
            Paragraph(tax_col_text, style_table_cell),
            Paragraph(f"<b>{tot:,.2f}</b>", style_table_cell_r)
        ])

    items_table = Table(item_rows, colWidths=col_widths)
    t_style = [
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 1.5*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 1.5*mm),
    ]
    # Alternating row background
    for r in range(1, len(item_rows)):
        if r % 2 == 0:
            t_style.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor("#f8fafc")))
    items_table.setStyle(TableStyle(t_style))
    story.append(items_table)
    story.append(Spacer(1, 3*mm))

    # 4. Summary & Tax Calculation Breakdown
    subtot = float(invoice_data.get('subtotal', 0.0))
    disc = float(invoice_data.get('discount_amount', 0.0))
    taxable_amt = float(invoice_data.get('taxable_amount', 0.0))
    cgst = float(invoice_data.get('cgst_amount', 0.0))
    sgst = float(invoice_data.get('sgst_amount', 0.0))
    igst = float(invoice_data.get('igst_amount', 0.0))
    grand_total = float(invoice_data.get('total_amount', 0.0))
    amt_words = invoice_data.get('amount_in_words') or number_to_words_inr(grand_total)

    # Left: Amount in Words + Bank Details + QR Code
    left_meta = []
    left_meta.append(Paragraph("<b>Amount in Words:</b>", style_body_bold))
    left_meta.append(Paragraph(f"<i>{amt_words}</i>", style_body))
    left_meta.append(Spacer(1, 2*mm))

    bank_html = f"""
    <b>Bank & Remittance Details:</b><br/>
    <b>Bank Name:</b> {invoice_data.get('bank_name', 'HDFC Bank Ltd - Corporate Banking')}<br/>
    <b>A/C No:</b> {invoice_data.get('bank_account_no', '50200088991122')} | <b>IFSC:</b> {invoice_data.get('bank_ifsc', 'HDFC0000123')}<br/>
    <b>Branch:</b> Commercial Freight Branch, Mumbai
    """
    left_meta.append(Paragraph(bank_html, style_small))

    # Right: Financial Totals Box
    totals_rows = [
        [Paragraph("Subtotal:", style_body), Paragraph(f"₹{subtot:,.2f}", style_right)],
    ]
    if disc > 0:
        totals_rows.append([Paragraph("Discount:", style_body), Paragraph(f"- ₹{disc:,.2f}", style_right)])
    totals_rows.append([Paragraph("Taxable Amount:", style_body_bold), Paragraph(f"₹{taxable_amt:,.2f}", style_right_bold)])

    if is_interstate:
        totals_rows.append([Paragraph("IGST (Integrated Tax):", style_body), Paragraph(f"₹{igst:,.2f}", style_right)])
    else:
        totals_rows.append([Paragraph("CGST (Central Tax):", style_body), Paragraph(f"₹{cgst:,.2f}", style_right)])
        totals_rows.append([Paragraph("SGST (State Tax):", style_body), Paragraph(f"₹{sgst:,.2f}", style_right)])

    totals_rows.append([
        Paragraph("<b>GRAND TOTAL (INR):</b>", ParagraphStyle('TotGrand', parent=style_body_bold, fontSize=9.5, textColor=COLOR_CYAN)),
        Paragraph(f"<b>₹{grand_total:,.2f}</b>", ParagraphStyle('TotGrandR', parent=style_right_bold, fontSize=11, textColor=COLOR_PRIMARY))
    ])

    totals_table = Table(totals_rows, colWidths=[42*mm, 38*mm])
    totals_table.setStyle(TableStyle([
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('BACKGROUND', (0,-1), (-1,-1), colors.HexColor("#e0f2fe")),
        ('TOPPADDING', (0,0), (-1,-1), 1.5*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1.5*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 2*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 2*mm),
    ]))

    summary_split_table = Table([[left_meta, totals_table]], colWidths=[106*mm, 80*mm])
    summary_split_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(summary_split_table)
    story.append(Spacer(1, 3*mm))

    # 5. Terms & Signature Block
    terms_text = invoice_data.get('terms_conditions') or (
        "1. Goods once delivered and accepted at weighbridge cannot be rejected without formal survey.<br/>"
        "2. Interest @ 18% p.a. will be levied on delayed payments exceeding the agreed credit tenor.<br/>"
        "3. Subject to jurisdiction of competent courts in Mumbai / Delivery State."
    )

    qr_flowable = None
    if qr_image_path and os.path.exists(qr_image_path):
        try:
            qr_flowable = RLImage(qr_image_path, width=22*mm, height=22*mm)
        except Exception:
            qr_flowable = None

    sign_html = f"""
    <div style="text-align: right;">
      <b>For {invoice_data.get('seller_company', 'Authorized Carrier')}</b><br/><br/><br/>
      <b>Authorized Signatory</b><br/>
      <font size="6" color="#64748b">Digitally Verified Document via TranceConnect-Prime</font>
    </div>
    """

    terms_cell = [
        Paragraph("<b>Terms & Conditions:</b>", style_small),
        Paragraph(terms_text, style_small)
    ]

    sign_cell = [
        Paragraph(sign_html, style_right)
    ]

    if qr_flowable:
        footer_cols = [terms_cell, qr_flowable, sign_cell]
        footer_widths = [95*mm, 26*mm, 65*mm]
    else:
        footer_cols = [terms_cell, sign_cell]
        footer_widths = [110*mm, 76*mm]

    footer_table = Table([footer_cols], colWidths=footer_widths)
    footer_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    story.append(KeepTogether([
        HRFlowable(width="100%", thickness=0.75, color=COLOR_BORDER, spaceAfter=2*mm),
        footer_table
    ]))

    doc.build(story)
    return pdf_path


# ===================================================================
# 4. REPORTLAB DELIVERY ORDER (DO) PDF GENERATOR
# ===================================================================
def generate_delivery_order_pdf(do_data, items_data, qr_image_path=None):
    """
    Builds a vector-sharp, professional Delivery Order (DO) & Gate Pass PDF.
    """
    do_num = do_data.get('do_number', 'TC-DO-2026-000001')
    clean_num = do_num.replace('/', '_').replace('-', '_')
    pdf_filename = f"delivery_order_{clean_num}_{uuid.uuid4().hex[:8]}.pdf"
    pdf_path = os.path.join(UPLOAD_DIR, pdf_filename)

    doc = SimpleDocTemplate(
        pdf_path,
        pagesize=A4,
        leftMargin=12 * mm,
        rightMargin=12 * mm,
        topMargin=12 * mm,
        bottomMargin=12 * mm
    )

    styles = getSampleStyleSheet()

    COLOR_PRIMARY = colors.HexColor("#060c18")
    COLOR_AMBER = colors.HexColor("#b45309")
    COLOR_TEAL = colors.HexColor("#0f766e")
    COLOR_TEXT = colors.HexColor("#1e293b")
    COLOR_MUTED = colors.HexColor("#64748b")
    COLOR_LIGHT = colors.HexColor("#f8fafc")
    COLOR_BORDER = colors.HexColor("#cbd5e1")

    style_title = ParagraphStyle('DOTitle', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=18, leading=22, textColor=COLOR_PRIMARY)
    style_subtitle = ParagraphStyle('DOSubTitle', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10, textColor=COLOR_AMBER)
    style_body = ParagraphStyle('DOBody', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10.5, textColor=COLOR_TEXT)
    style_body_bold = ParagraphStyle('DOBodyBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10.5, textColor=COLOR_TEXT)
    style_small = ParagraphStyle('DOSmall', parent=styles['Normal'], fontName='Helvetica', fontSize=7, leading=9, textColor=COLOR_MUTED)
    style_right = ParagraphStyle('DORight', parent=styles['Normal'], fontName='Helvetica', fontSize=8, leading=10.5, textColor=COLOR_TEXT, alignment=TA_RIGHT)
    style_right_bold = ParagraphStyle('DORightBold', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10.5, textColor=COLOR_TEXT, alignment=TA_RIGHT)
    style_table_header = ParagraphStyle('DOTH', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=7.5, leading=9, textColor=colors.white, alignment=TA_CENTER)
    style_table_cell = ParagraphStyle('DOTC', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=COLOR_TEXT)
    style_table_cell_r = ParagraphStyle('DOTCR', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9.5, textColor=COLOR_TEXT, alignment=TA_RIGHT)

    story = []

    # 1. Header (Brand + Document Title)
    logo_path = os.path.join(ASSETS_DIR, 'logo.png')
    logo_flowable = None
    if os.path.exists(logo_path):
        try:
            logo_flowable = RLImage(logo_path, width=42*mm, height=12*mm)
        except Exception:
            logo_flowable = Paragraph("<b>TRANCECONNECT-PRIME</b>", style_title)
    else:
        logo_flowable = Paragraph("<font color='#f59e0b'>◆</font> <b>TRANCECONNECT-PRIME</b>", style_title)

    header_left = [
        logo_flowable,
        Spacer(1, 1*mm),
        Paragraph("Commercial Freight Network & Fleet Authorization", style_subtitle)
    ]

    header_right = [
        Paragraph("<b>DELIVERY ORDER (DO)</b>", ParagraphStyle('DOH1', parent=style_title, fontSize=15, alignment=TA_RIGHT, textColor=COLOR_AMBER)),
        Paragraph("<b>& MATERIAL DISPATCH PASS</b>", ParagraphStyle('DOH2', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, alignment=TA_RIGHT, textColor=COLOR_MUTED)),
        Paragraph(f"<b>DO Number:</b> {do_num}", style_right_bold),
        Paragraph(f"<b>DO Date:</b> {do_data.get('do_date', '')}", style_right),
        Paragraph(f"<b>Valid Until:</b> {do_data.get('valid_until', '7 Days from Issue')}", style_right)
    ]

    header_table = Table([[header_left, header_right]], colWidths=[95*mm, 91*mm])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3*mm),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=COLOR_PRIMARY, spaceAfter=3*mm))

    # 2. Consignor & Consignee 2-Column Panel
    consignor_html = f"""
    <b>CONSIGNOR / ISSUED BY:</b><br/>
    <b>{do_data.get('consignor_company', '')}</b><br/>
    {do_data.get('consignor_address', '')}<br/>
    <b>GSTIN:</b> {do_data.get('consignor_gst', 'N/A')}<br/>
    <b>Mobile:</b> {do_data.get('consignor_mobile', '')}
    """

    consignee_html = f"""
    <b>CONSIGNEE / DELIVER TO:</b><br/>
    <b>{do_data.get('consignee_company', '')}</b><br/>
    {do_data.get('consignee_address', '')}<br/>
    <b>Contact Person:</b> {do_data.get('consignee_contact', 'Yard Supervisor')}<br/>
    <b>Mobile:</b> {do_data.get('consignee_mobile', '')} | <b>GST:</b> {do_data.get('consignee_gst', 'N/A')}
    """

    parties_table = Table([[
        Paragraph(consignor_html, style_body),
        Paragraph(consignee_html, style_body)
    ]], colWidths=[93*mm, 93*mm])
    parties_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), COLOR_LIGHT),
        ('BACKGROUND', (1,0), (1,0), colors.HexColor("#fef3c7")),
        ('BOX', (0,0), (0,0), 0.5, COLOR_BORDER),
        ('BOX', (1,0), (1,0), 0.5, colors.HexColor("#fde68a")),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 2.5*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2.5*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 3*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 3*mm),
    ]))
    story.append(parties_table)
    story.append(Spacer(1, 2.5*mm))

    # 3. Carrier, Vehicle & Driver Allocation Details
    v_num = do_data.get('vehicle_number', 'MH-04-AB-1234')
    v_type = do_data.get('vehicle_type', 'Multi-Axle Truck')
    d_name = do_data.get('driver_name', 'Commercial Driver')
    d_mob = do_data.get('driver_mobile', 'N/A')
    d_lic = do_data.get('driver_license', 'N/A')
    t_comp = do_data.get('transporter_company', 'Authorized Transport Partner')

    carrier_html = f"""
    <b>ALLOCATED CARRIER & DRIVER DETAILS:</b><br/>
    <b>Transporter:</b> {t_comp} | <b>Vehicle Reg No:</b> <b>{v_num}</b> ({v_type})<br/>
    <b>Driver Name:</b> {d_name} | <b>Driver Mobile:</b> {d_mob} | <b>Driving License:</b> {d_lic}<br/>
    <b>Origin Depot:</b> {do_data.get('pickup_location', '')} ➔ <b>Destination Yard:</b> {do_data.get('delivery_location', '')}
    """
    carrier_table = Table([[Paragraph(carrier_html, style_body)]], colWidths=[186*mm])
    carrier_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#e2e8f0")),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 2*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 3*mm),
    ]))
    story.append(carrier_table)
    story.append(Spacer(1, 3*mm))

    # 4. Material / Cargo Schedule Table
    table_headers = [
        Paragraph("Sr", style_table_header),
        Paragraph("Product / Commodity Description", style_table_header),
        Paragraph("Quantity", style_table_header),
        Paragraph("Unit", style_table_header),
        Paragraph("Net Weight (Tons)", style_table_header),
        Paragraph("Package Type", style_table_header),
        Paragraph("Remarks", style_table_header)
    ]
    col_widths = [10*mm, 62*mm, 20*mm, 16*mm, 28*mm, 26*mm, 24*mm]

    item_rows = [table_headers]
    tot_weight = 0.0
    for idx, item in enumerate(items_data, 1):
        wt = float(item.get('weight', 0.0))
        tot_weight += wt
        qty = float(item.get('quantity', 1.0))
        item_rows.append([
            Paragraph(str(idx), style_table_cell),
            Paragraph(f"<b>{item.get('product_description', '')}</b>", style_table_cell),
            Paragraph(f"{qty:,.2f}", style_table_cell_r),
            Paragraph(item.get('unit', 'Tons'), style_table_cell),
            Paragraph(f"{wt:,.2f}", style_table_cell_r),
            Paragraph(item.get('package_type', 'Standard Pallets'), style_table_cell),
            Paragraph(item.get('remarks', 'Good Condition'), style_table_cell)
        ])

    items_table = Table(item_rows, colWidths=col_widths)
    t_style = [
        ('BACKGROUND', (0,0), (-1,0), COLOR_PRIMARY),
        ('GRID', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 1.5*mm),
        ('RIGHTPADDING', (0,0), (-1,-1), 1.5*mm),
    ]
    for r in range(1, len(item_rows)):
        if r % 2 == 0:
            t_style.append(('BACKGROUND', (0, r), (-1, r), colors.HexColor("#f8fafc")))
    items_table.setStyle(TableStyle(t_style))
    story.append(items_table)
    story.append(Spacer(1, 3*mm))

    # 5. Instructions & Handling Guidance
    del_instr = do_data.get('delivery_instructions') or "Deliver within business hours (08:00 to 18:00). Hand over original weighbridge slip to unloading officer."
    hand_instr = do_data.get('handling_instructions') or "Secure cargo with industrial tie-down straps. Weatherproof tarpaulin required."
    
    instr_html = f"""
    <b>SPECIAL DISPATCH & HANDLING INSTRUCTIONS:</b><br/>
    &bull; <b>Delivery Instructions:</b> {del_instr}<br/>
    &bull; <b>Handling Instructions:</b> {hand_instr}<br/>
    &bull; <b>Total Authorized Weight:</b> <b>{tot_weight:,.2f} Tons</b> &bull; <b>Inspection Status:</b> <font color='#16a34a'><b>Passed Gate Inspection</b></font>
    """
    instr_table = Table([[Paragraph(instr_html, style_small)]], colWidths=[186*mm])
    instr_table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor("#f1f5f9")),
        ('BOX', (0,0), (-1,-1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0,0), (-1,-1), 2*mm),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2*mm),
        ('LEFTPADDING', (0,0), (-1,-1), 3*mm),
    ]))
    story.append(instr_table)
    story.append(Spacer(1, 3*mm))

    # 6. Tripartite Signatures: Consignor, Carrier, Receiver + QR
    qr_flowable = None
    if qr_image_path and os.path.exists(qr_image_path):
        try:
            qr_flowable = RLImage(qr_image_path, width=22*mm, height=22*mm)
        except Exception:
            qr_flowable = None

    col_w = 44*mm if qr_flowable else 62*mm

    sign_consignor = [
        Paragraph(f"<b>Issued By (Consignor):</b><br/>{do_data.get('consignor_company', '')}<br/><br/><br/>_______________________<br/>Authorized Officer", style_small)
    ]
    sign_carrier = [
        Paragraph(f"<b>Carrier / Driver Acknowledgment:</b><br/>Received in sound condition.<br/><br/><br/>_______________________<br/>Driver Signature ({d_name})", style_small)
    ]
    sign_receiver = [
        Paragraph(f"<b>Material Receipt (Consignee):</b><br/>Goods received as per specs.<br/><br/><br/>_______________________<br/>Receiving Yard Seal", style_small)
    ]

    if qr_flowable:
        sigs = [sign_consignor, sign_carrier, sign_receiver, qr_flowable]
        sig_widths = [50*mm, 54*mm, 54*mm, 28*mm]
    else:
        sigs = [sign_consignor, sign_carrier, sign_receiver]
        sig_widths = [62*mm, 62*mm, 62*mm]

    sig_table = Table([sigs], colWidths=sig_widths)
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))

    story.append(KeepTogether([
        HRFlowable(width="100%", thickness=0.75, color=COLOR_BORDER, spaceAfter=2*mm),
        sig_table
    ]))

    doc.build(story)
    return pdf_path
