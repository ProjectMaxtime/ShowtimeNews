const fs = require('fs');

async function generateShop() {
  const itemsUrl = 'https://cdn.jsdelivr.net/gh/ProjectMaxtime/ShowtimeNews@main/Backend/RandomShopItems.json';
  const bundlesUrl = 'https://cdn.jsdelivr.net/gh/ProjectMaxtime/ShowtimeNews@main/Backend/AuthItems/Bundles.json';

  try {
    const [itemsResponse, bundlesResponse] = await Promise.all([
      fetch(itemsUrl),
      fetch(bundlesUrl)
    ]);

    const data = await itemsResponse.json();
    let bundlesData = {};
    try { bundlesData = await bundlesResponse.json(); } catch (e) {}

    const bundlesMap = new Map();
    if (Array.isArray(bundlesData)) {
      bundlesData.forEach(b => { if (b.id) bundlesMap.set(b.id.toString(), b); else bundlesMap.set(b.toString(), {}); });
    } else {
      Object.keys(bundlesData).forEach(k => bundlesMap.set(k.toString(), bundlesData[k]));
    }

    const nowMs = Date.now();
    const dailyMs = 24 * 60 * 60 * 1000;
    const weeklyMs = 7 * 24 * 60 * 60 * 1000;

    const currentDailyEpoch = Math.floor(nowMs / dailyMs);
    const currentWeeklyEpoch = Math.floor(nowMs / weeklyMs);
    const totalOffset = parseInt(data.ShopOffset || '0', 10);

    const activeDailyEpoch = currentDailyEpoch + totalOffset;
    const activeWeeklyEpoch = currentWeeklyEpoch + totalOffset;

    const dailyStart = new Date(currentDailyEpoch * dailyMs).toISOString();
    const dailyEnd = new Date((currentDailyEpoch + 1) * dailyMs).toISOString();
    const weeklyStart = new Date(currentWeeklyEpoch * weeklyMs).toISOString();
    const weeklyEnd = new Date((currentWeeklyEpoch + 1) * weeklyMs).toISOString();

    const mulberry32 = (a) => function() { let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const deterministicShuffle = (array, seed) => { let rng = mulberry32(seed); let arr = [...array]; for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
    
    const getRotatingSlice = (array, itemsPerPeriod, periodIndex, seed, fallbackArray = []) => { 
      let pool = [...new Set(array || [])]; 
      if (pool.length < itemsPerPeriod && fallbackArray.length > 0) { 
        const fallbackUnique = [...new Set(fallbackArray)].filter(id => !pool.includes(id)); 
        pool = pool.concat(fallbackUnique); 
      } 
      if (pool.length === 0) return []; 
      const shuffled = deterministicShuffle(pool, seed); 
      const startIndex = (periodIndex * itemsPerPeriod) % shuffled.length; 
      let result = []; 
      for (let i = 0; i < itemsPerPeriod; i++) result.push(shuffled[(startIndex + i) % shuffled.length]); 
      return result; 
    };

    const getFixedPriceForId = (id, isFeatured) => { const numId = parseInt(id, 10) || 0; const pseudoRandom = ((numId * 9301) + 49297) % 233280 / 233280; return isFeatured ? (Math.floor(pseudoRandom * 29) + 2) * 100 : (Math.floor(pseudoRandom * 16) + 5) * 100; };
    const getRarityForId = (id) => { const numId = parseInt(id, 10) || 0; return ['Common', 'Epic'][numId % 2]; };
    
    const formatItems = (itemIds, isFeatured) => { 
      if (!itemIds || !Array.isArray(itemIds) || itemIds.length === 0) itemIds = isFeatured ? [201, 202, 203, 204, 205, 206] : [101, 102, 103, 104, 105, 106, 107, 108]; 
      return itemIds.map(id => { 
        const numId = parseInt(id, 10) || 0; 
        const fixedPrice = getFixedPriceForId(id, isFeatured); 
        return { id: numId, priceInCoins: fixedPrice, salePriceInCoins: fixedPrice, rarity: getRarityForId(id) }; 
      }); 
    };

    let allItems = [...new Set((data.Items || []).filter(id => id !== null && id !== ''))];
    let allFeatured = [...new Set((data.ItemsFeatured || []).filter(id => id !== null && id !== ''))];
    if (allItems.length === 0) allItems = [101, 102, 103, 104, 105, 106, 107, 108];
    if (allFeatured.length === 0) allFeatured = [201, 202, 203, 204, 205, 206];

    let dailyIds = getRotatingSlice(allItems, 8, activeDailyEpoch, 12345, allItems);
    let specialIds = getRotatingSlice(allItems, 5, activeDailyEpoch + 100, 54321, allItems);
    
    const featuredBundles = allFeatured.filter(id => bundlesMap.get(id.toString())?.Outfit === false);
    const featuredRegular = allFeatured.filter(id => !bundlesMap.has(id.toString()));

    let finalFeaturedIds = [];
    if (featuredBundles.length > 0) {
        finalFeaturedIds.push(getRotatingSlice(featuredBundles, 1, activeWeeklyEpoch, 999, allFeatured)[0]);
        finalFeaturedIds.push(...getRotatingSlice(featuredRegular, 5, activeWeeklyEpoch, 888, allItems));
    } else {
        finalFeaturedIds = getRotatingSlice(featuredRegular.length > 0 ? featuredRegular : allFeatured, 6, activeWeeklyEpoch, 888, allItems);
    }

    const shopSets = [
      { displayName: 'Featured', shoppyType: 'featured', startTime: weeklyStart, endTime: weeklyEnd, itemSets: formatItems(finalFeaturedIds, true) },
      { displayName: 'Special', shoppyType: 'Special', startTime: dailyStart, endTime: dailyEnd, itemSets: formatItems(specialIds, false) },
      { displayName: 'Daily Shop', shoppyType: 'daily', startTime: dailyStart, endTime: dailyEnd, itemSets: formatItems(dailyIds, false) }
    ];

    fs.writeFileSync('Backend/shop.json', JSON.stringify({ General: shopSets }, null, 2));
    console.log('shop.json успешно обновлен!');

  } catch (error) {
    console.error('Ошибка генерации магазина:', error);
    process.exit(1); 
  }
}

generateShop();
