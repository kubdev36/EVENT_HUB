export const BRAND_LOGOS = {
  minhtuan: '/img/mtm.jpg',
  cellphones: '/img/cellphones.png',
  hoangha: '/img/hoangha.jpg',
  fptshop: '/img/fpt.png',
  fpt: '/img/fpt.png',
  tgdd: '/img/tgdd.jpg',
  thegioididong: '/img/tgdd.jpg',
  nguyenkim: '/img/nguyenkim.png',
};

export function getBrandLogo(brandId, brandName, currentLogo) {
  if (currentLogo && typeof currentLogo === 'string' && currentLogo.trim().length > 0) {
    return currentLogo;
  }

  const id = String(brandId || '').toLowerCase().trim();
  const name = String(brandName || '').toLowerCase().trim();

  if (id.includes('minhtuan') || name.includes('minh tuấn') || name.includes('minh tuan')) {
    return BRAND_LOGOS.minhtuan;
  }
  if (id.includes('cellphones') || name.includes('cellphones')) {
    return BRAND_LOGOS.cellphones;
  }
  if (id.includes('hoangha') || name.includes('hoàng hà') || name.includes('hoang ha')) {
    return BRAND_LOGOS.hoangha;
  }
  if (id.includes('fpt') || name.includes('fpt')) {
    return BRAND_LOGOS.fptshop;
  }
  if (
    id.includes('tgdd') ||
    id.includes('thegioididong') ||
    name.includes('thế giới di động') ||
    name.includes('the gioi di dong')
  ) {
    return BRAND_LOGOS.tgdd;
  }
  if (id.includes('nguyenkim') || name.includes('nguyễn kim') || name.includes('nguyen kim')) {
    return BRAND_LOGOS.nguyenkim;
  }

  return '/img/mtm.jpg';
}
