"""
Linguist-Guardian — Fake User Seed Data.

Seeds the database with 20 realistic Indian user profiles for
document verification testing. Includes name, PAN, Aadhaar, DOB,
address, and phone for each user.
"""

from __future__ import annotations

from typing import List, Dict

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.models import FakeUser

# ── 20 Sample Users ──────────────────────────────────────────
FAKE_USERS: List[Dict[str, str]] = [
    {"name": "Priya Devi Singh", "pan_number": "BDFPS5678L", "aadhaar_number": "345678901234", "dob": "22/07/1990", "address": "45, Nehru Nagar, Patna, Bihar", "phone": "9876543211"},
    {"name": "Aditya Rajesh Yadav", "pan_number": "ARYPA2610F", "aadhaar_number": "608544627814", "dob": "26/10/2006", "address": "45, Nehru Nagar, Patna, Bihar", "phone": "9876543211"},
    {"name": "Rajesh Kumar Sharma", "pan_number": "ABCPS1234K", "aadhaar_number": "234567890123", "dob": "15/03/1985", "address": "12, MG Road, Lucknow, UP", "phone": "9876543210"},
    {"name": "Amit Kumar Verma", "pan_number": "CDGPV9012M", "aadhaar_number": "456789012345", "dob": "08/11/1988", "address": "78, Civil Lines, Bhopal, MP", "phone": "9876543212"},
    {"name": "Sunita Rani Gupta", "pan_number": "DEHPG3456N", "aadhaar_number": "567890123456", "dob": "30/01/1975", "address": "23, Gandhi Marg, Jaipur, Rajasthan", "phone": "9876543213"},
    {"name": "Vikram Singh Chauhan", "pan_number": "EFIPC7890P", "aadhaar_number": "678901234567", "dob": "14/06/1982", "address": "56, Station Road, Dehradun, UK", "phone": "9876543214"},
    {"name": "Meena Kumari Patel", "pan_number": "FGJPP1234Q", "aadhaar_number": "789012345678", "dob": "25/09/1993", "address": "89, Ring Road, Ahmedabad, Gujarat", "phone": "9876543215"},
    {"name": "Suresh Babu Reddy", "pan_number": "GHKPR5678R", "aadhaar_number": "890123456789", "dob": "03/12/1970", "address": "34, Tank Bund, Hyderabad, Telangana", "phone": "9876543216"},
    {"name": "Anita Sharma Mishra", "pan_number": "HILPM9012S", "aadhaar_number": "901234567890", "dob": "17/04/1987", "address": "67, Mall Road, Shimla, HP", "phone": "9876543217"},
    {"name": "Deepak Chand Joshi", "pan_number": "IJMPJ3456T", "aadhaar_number": "012345678901", "dob": "29/08/1979", "address": "90, Cantt Area, Meerut, UP", "phone": "9876543218"},
    {"name": "Kavita Devi Yadav", "pan_number": "JKNPY7890U", "aadhaar_number": "123456789012", "dob": "11/02/1995", "address": "12, Ashok Nagar, Ranchi, Jharkhand", "phone": "9876543219"},
    {"name": "Ramesh Prasad Tiwari", "pan_number": "KLOPT1234V", "aadhaar_number": "213456789013", "dob": "05/05/1968", "address": "45, Hazratganj, Lucknow, UP", "phone": "9876543220"},
    {"name": "Pooja Rani Dubey", "pan_number": "LMPQD5678W", "aadhaar_number": "314567890124", "dob": "18/10/1991", "address": "78, Kankarbagh, Patna, Bihar", "phone": "9876543221"},
    {"name": "Arun Kumar Das", "pan_number": "MNQRD9012X", "aadhaar_number": "415678901235", "dob": "27/01/1983", "address": "23, Park Street, Kolkata, WB", "phone": "9876543222"},
    {"name": "Rekha Devi Sinha", "pan_number": "NORS13456Y", "aadhaar_number": "516789012346", "dob": "09/07/1976", "address": "56, Fraser Road, Patna, Bihar", "phone": "9876543223"},
    {"name": "Manoj Kumar Pandey", "pan_number": "OPSP57890Z", "aadhaar_number": "617890123457", "dob": "21/03/1989", "address": "89, Vidhan Sabha Marg, Lucknow, UP", "phone": "9876543224"},
    {"name": "Suman Lata Agarwal", "pan_number": "PQTA91234A", "aadhaar_number": "718901234568", "dob": "13/11/1972", "address": "34, Mahatma Gandhi Road, Agra, UP", "phone": "9876543225"},
    {"name": "Ravi Shankar Iyer", "pan_number": "QRUI35678B", "aadhaar_number": "819012345679", "dob": "06/06/1986", "address": "67, Anna Salai, Chennai, TN", "phone": "9876543226"},
    {"name": "Geeta Bai Jatav", "pan_number": "RSVJ79012C", "aadhaar_number": "920123456780", "dob": "24/12/1994", "address": "90, Dak Bungalow Road, Indore, MP", "phone": "9876543227"},
    {"name": "Prakash Chandra Mehta", "pan_number": "STWM13456D", "aadhaar_number": "021234567891", "dob": "02/09/1981", "address": "12, JLN Marg, Jaipur, Rajasthan", "phone": "9876543228"},
    {"name": "Nisha Kumari Roy", "pan_number": "TUXR57890E", "aadhaar_number": "132345678902", "dob": "19/04/1992", "address": "45, SP Mukherjee Road, Kolkata, WB", "phone": "9876543229"},
]


async def seed_fake_users(session: AsyncSession) -> None:
    """
    Populate the fake_users table if it is empty.

    Checks for existing records first to make seeding idempotent.
    """
    result = await session.execute(select(FakeUser).limit(1))
    if result.scalars().first() is not None:
        logger.info("Fake users already seeded — skipping.")
        return

    for user_data in FAKE_USERS:
        session.add(FakeUser(**user_data))

    await session.commit()
    logger.info("Seeded %d fake users.", len(FAKE_USERS))
