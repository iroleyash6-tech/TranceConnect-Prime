import os
import re
import requests
from dotenv import load_dotenv

load_dotenv()
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

def get_logistics_ai_reply(prompt: str, user_role: str = 'dealer', user_company: str = '', context_data: dict = None) -> str:
    """
    Provides intelligent logistics assistance.
    Uses Google Gemini API if GEMINI_API_KEY or AI_API_KEY is configured in .env.
    Otherwise, uses an advanced logistics expert rule-based reasoning engine.
    """
    api_key = os.getenv('GEMINI_API_KEY') or os.getenv('AI_API_KEY')
    
    if api_key and api_key.strip():
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key.strip()}"
            system_instruction = (
                f"You are the TranceConnect-Prime AI Logistics Specialist. "
                f"You assist verified {user_role}s (User Company: {user_company or 'TranceConnect User'}). "
                f"Provide concise, practical advice on Indian logistics, road freight, truck selection (14ft, 20ft, 32ft MXL, trailers), "
                f"E-Way bill regulations, DO (Delivery Order), Invoices, RC, live tracking, and pricing."
            )
            payload = {
                "contents": [
                    {
                        "parts": [
                            {"text": system_instruction + "\nUser Question: " + prompt}
                        ]
                    }
                ]
            }
            resp = requests.post(url, json=payload, timeout=8)
            if resp.status_code == 200:
                result = resp.json()
                reply = result['candidates'][0]['content']['parts'][0]['text']
                return reply.strip()
        except Exception:
            # Fallback gracefully to domain engine if network/API fails
            pass

    # Built-in Domain Logistics Intelligence Engine
    q = prompt.lower()
    
    # Vehicle recommendation queries
    if any(k in q for k in ['vehicle', 'truck', 'which truck', 'capacity', 'size', 'ton', 'tonnage']):
        weight_match = re.search(r'(\d+(\.\d+)?)\s*(ton|tons|tonne|tonnes|t)', q)
        if weight_match:
            wt = float(weight_match.group(1))
            if wt <= 2.5:
                return f"For **{wt} tons**, a **Tata 407 / Pickup (2.5T capacity)** is optimal and cost-effective for local or intra-city freight."
            elif wt <= 5.0:
                return f"For **{wt} tons**, a **14ft Open/Closed Container Truck (4–5T capacity)** is recommended. Ideal for FMCG, small industrial lots, and pharma."
            elif wt <= 9.0:
                return f"For **{wt} tons**, a **17ft to 19ft Medium Commercial Truck (7–9T capacity)** offers high fuel efficiency and optimal turnaround time."
            elif wt <= 16.0:
                return f"For **{wt} tons**, a **20ft to 24ft Multi-Axle Container Truck (12–16T capacity)** is ideal for secure, weather-protected long-haul transit."
            elif wt <= 28.0:
                return f"For **{wt} tons**, a **32ft Multi-Axle Truck (MXL, 20–28T capacity)** is the industry standard for steel, cement, machinery, and high-volume FTL."
            else:
                return f"For heavy cargo of **{wt} tons**, a **40ft Heavy Flatbed Trailer or Hydraulic Axle Puller** is required with proper ODC (Over Dimensional Cargo) permits."
        return (
            "🚚 **Vehicle Selection Guide on TranceConnect-Prime**:\n\n"
            "• **Small Commercial (1–3 Tons)**: Intra-city pickups, express parcels.\n"
            "• **14ft–17ft Trucks (4–8 Tons)**: Medium inter-city shipments, agricultural produce.\n"
            "• **20ft Container (10–15 Tons)**: Electronics, textiles, weather-sensitive cargo.\n"
            "• **32ft MXL (20–26 Tons)**: Heavy industrial steel, metals, cement, bulk consumer goods.\n"
            "• **40ft Trailer (28+ Tons)**: Machinery, structural steel, containerized export/import."
        )

    # Workflow queries
    if any(k in q for k in ['workflow', 'how does it work', 'how to create', 'process', 'step']):
        return (
            "📋 **TranceConnect-Prime End-to-End Workflow**:\n\n"
            "1. **Shipment Creation**: Dealer enters cargo specifications (Product type, Transport type, Weight, Pickup & Delivery locations, Trip price) and uploads Invoice & DO.\n"
            "2. **Transporter Selection**: Dealer chooses a verified Transporter or posts to available transport pool.\n"
            "3. **Transporter Review**: Transporter receives instant alert, checks cargo specs, and clicks **Accept** (or Reject).\n"
            "4. **Vehicle & Driver Dispatch**: Transporter assigns a verified truck & licensed driver, then marks status **In Transit**.\n"
            "5. **Live Tracking & Location Center**: Both parties view real-time GPS telemetry, speed, checkpoints, and route progress.\n"
            "6. **Live Chat**: Direct in-app communication for loading/unloading instructions.\n"
            "7. **Delivery Confirmation**: Transporter marks **Delivered**, closing the trip cycle."
        )

    # Document requirements
    if any(k in q for k in ['document', 'invoice', 'do', 'delivery order', 'rc', 'insurance', 'aadhaar', 'license']):
        return (
            "📑 **Required Logistics Documentation**:\n\n"
            "• **Dealer Documents**:\n"
            "  - **Commercial Invoice**: Required for cargo value declaration and GST compliance.\n"
            "  - **Delivery Order (DO)**: Authorizes release and handover of goods at pickup.\n"
            "  - **E-Way Bill**: Mandatory under GST for consignments valued over ₹50,000.\n\n"
            "• **Transporter Verification**:\n"
            "  - **Registration Certificate (RC)**: Validates vehicle fitness, axle ratings & permit.\n"
            "  - **Commercial Insurance Policy**: Protects against transit liability and road risks.\n"
            "  - **Driver Driving License & Aadhaar Card**: Verified by Admin before trip assignment."
        )

    # Status / tracking
    if any(k in q for k in ['track', 'tracking', 'status', 'where is', 'location', 'live']):
        return (
            "🛰️ **Live Tracking on TranceConnect-Prime**:\n\n"
            "• When a shipment is **In Transit**, live GPS telemetry streams to both the Dealer and Transporter dashboards.\n"
            "• You can open the **Live Tracking Radar** from your dashboard table by clicking the **'Live Track'** button.\n"
            "• Transporters can update checkpoint locations directly through their mobile/desktop interface with real-time timestamps."
        )

    # Pricing / Rates
    if any(k in q for k in ['price', 'rate', 'cost', 'fare', 'quote', 'freight charges']):
        return (
            "💰 **Freight Rate Calculation Factors**:\n\n"
            "• **Base Rate**: Distance (per km) × Cargo Weight (Tons) or fixed trip rate.\n"
            "• **Toll & Fuel Surcharge**: Long-haul NHAI toll plazas and diesel rate index adjustments.\n"
            "• **Detention Charges**: Applicable if loading/unloading exceeds agreed free hours.\n"
            "• **Loading / Unloading (Hamali)**: Specified in the shipment terms.\n"
            "💡 *Tip: Enter competitive per-trip prices in your shipment request to secure top-rated transporters quickly.*"
        )

    # Default helpful assistant response
    return (
        f"👋 Hello! I am your **TranceConnect-Prime AI Logistics Specialist**.\n\n"
        f"I can assist you with:\n"
        f"• **Vehicle Sizing & Capacity**: Tell me your tonnage and cargo type.\n"
        f"• **Regulatory Compliance**: GST, E-Way Bill, Delivery Orders & Invoices.\n"
        f"• **Workflow Guidance**: Creating shipments, accepting trips, assigning drivers.\n"
        f"• **Live Tracking & Route Optimization**: GPS updates and checkpoint logs.\n\n"
        f"How can I assist your transport operations today?"
    )
