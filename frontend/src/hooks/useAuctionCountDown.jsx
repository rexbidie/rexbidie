import { useEffect, useState } from "react";
import { getServerNow } from "../utils/serverClock";

const useAuctionCountdown = (auction) => {
  const [countdown, setCountdown] = useState({
    days: '00',
    hours: '00',
    minutes: '00',
    seconds: '00',
    status: 'loading'
  });

  useEffect(() => {
    if (!auction) {
      setCountdown({
        days: '00', hours: '00', minutes: '00', seconds: '00',
        status: 'loading'
      });
      return;
    }

    const calculateTimeLeft = () => {
      // Server-aligned time, so a phone with a wrong clock still shows the right time left.
      const now = new Date(getServerNow());
      const startDate = new Date(auction.startDate);
      const endDate = new Date(auction.endDate);

      // ===== ALWAYS AVAILABLE AUCTIONS (Buy Now & Giveaway) =====
      if (auction.auctionType === 'buy_now' || auction.auctionType === 'giveaway') {
        // If already has a winner
        if (auction.winner) {
          return {
            days: '00', hours: '00', minutes: '00', seconds: '00',
            status: auction.auctionType === 'buy_now' ? 'purchased' : 'claimed'
          };
        }
        
        // Active and available
        return {
          days: '00', hours: '00', minutes: '00', seconds: '00',
          status: 'always-available'
        };
      }

      // ===== TIMED AUCTIONS (Standard & Reserve) =====
      
      if (auction.status === 'approved') {
        if (now >= startDate) {
          const timeUntilEnd = endDate - now;
          return {
            days: Math.floor(timeUntilEnd / (1000 * 60 * 60 * 24)).toString().padStart(2, '0'),
            hours: Math.floor((timeUntilEnd / (1000 * 60 * 60)) % 24).toString().padStart(2, '0'),
            minutes: Math.floor((timeUntilEnd / 1000 / 60) % 60).toString().padStart(2, '0'),
            seconds: Math.floor((timeUntilEnd / 1000) % 60).toString().padStart(2, '0'),
            status: 'counting-down'
          };
        }
        
        const timeUntilStart = startDate - now;
        return {
          days: Math.floor(timeUntilStart / (1000 * 60 * 60 * 24)).toString().padStart(2, '0'),
          hours: Math.floor((timeUntilStart / (1000 * 60 * 60)) % 24).toString().padStart(2, '0'),
          minutes: Math.floor((timeUntilStart / 1000 / 60) % 60).toString().padStart(2, '0'),
          seconds: Math.floor((timeUntilStart / 1000) % 60).toString().padStart(2, '0'),
          status: 'approved'
        };
      }

      if (auction.status === 'draft') {
        return {
          days: '00', hours: '00', minutes: '00', seconds: '00',
          status: 'draft'
        };
      }

      if (auction.status === 'cancelled' || auction.status === 'suspended') {
        return {
          days: '00', hours: '00', minutes: '00', seconds: '00',
          status: auction.status
        };
      }

      if (auction.status === 'active') {
        if (now >= endDate) {
          return {
            days: '00', hours: '00', minutes: '00', seconds: '00',
            status: 'ended'
          };
        }

        const timeUntilEnd = endDate - now;
        return {
          days: Math.floor(timeUntilEnd / (1000 * 60 * 60 * 24)).toString().padStart(2, '0'),
          hours: Math.floor((timeUntilEnd / (1000 * 60 * 60)) % 24).toString().padStart(2, '0'),
          minutes: Math.floor((timeUntilEnd / 1000 / 60) % 60).toString().padStart(2, '0'),
          seconds: Math.floor((timeUntilEnd / 1000) % 60).toString().padStart(2, '0'),
          status: 'counting-down'
        };
      }

      if (['ended', 'reserve_not_met', 'sold', 'sold_buy_now'].includes(auction.status)) {
        return {
          days: '00', hours: '00', minutes: '00', seconds: '00',
          status: 'ended'
        };
      }

      return {
        days: '00', hours: '00', minutes: '00', seconds: '00',
        status: auction.status || 'unknown'
      };
    };

    setCountdown(calculateTimeLeft());

    const timer = setInterval(() => {
      setCountdown(calculateTimeLeft());
    }, 1000);

    return () => clearInterval(timer);
  }, [auction]);

  return countdown;
};

export default useAuctionCountdown;