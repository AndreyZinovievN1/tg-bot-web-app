import os

import aiohttp
from aiogram import F, Router
from aiogram.types import Message, PreCheckoutQuery

router = Router()

MINI_APP_PAYMENT_URL = os.getenv("MINI_APP_PAYMENT_URL", "https://your-mini-app-domain/api/payments/telegram/update")
PAYMENT_RELAY_SECRET = os.getenv("PAYMENT_RELAY_SECRET", "")


async def forward_update(payload: dict) -> None:
    async with aiohttp.ClientSession() as session:
        await session.post(
            MINI_APP_PAYMENT_URL,
            json=payload,
            headers={"x-miniapp-payments-secret": PAYMENT_RELAY_SECRET},
            timeout=aiohttp.ClientTimeout(total=10),
        )


@router.pre_checkout_query()
async def on_pre_checkout_query(query: PreCheckoutQuery) -> None:
    await query.answer(ok=True)


@router.message(F.successful_payment)
async def on_successful_payment(message: Message) -> None:
    await forward_update({"message": message.model_dump(mode="json")})
