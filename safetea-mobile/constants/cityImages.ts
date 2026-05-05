import { ImageSourcePropType } from 'react-native';

export const CITY_IMAGES: Record<string, { image: ImageSourcePropType; emoji: string; color: string }> = {
  lax: { image: require('../assets/cities/losangeles.jpg'), emoji: '🎬', color: '#F0D4C4' },
  mia: { image: require('../assets/cities/miami.jpg'), emoji: '🌴', color: '#C4E8F0' },
  dal: { image: require('../assets/cities/dallas.jpg'), emoji: '🤠', color: '#D4F0E0' },
  atl: { image: require('../assets/cities/atlanta.jpg'), emoji: '🏗️', color: '#F0D4D4' },
  nyc: { image: require('../assets/cities/newyork.png'), emoji: '🗽', color: '#D4E0F0' },
  chi: { image: require('../assets/cities/chicago.jpg'), emoji: '🏙️', color: '#F0C4D4' },
  hou: { image: require('../assets/cities/houston.jpg'), emoji: '🚀', color: '#E8D4F0' },
};

export const CITY_FALLBACK = { emoji: '🏙️', color: '#F0E0E8' };

export const getCityMeta = (cityId: string) => CITY_IMAGES[cityId] || CITY_FALLBACK;
