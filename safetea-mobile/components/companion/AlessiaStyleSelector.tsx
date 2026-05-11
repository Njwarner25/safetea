import { View, Pressable, StyleSheet } from 'react-native';
import { AlessiaAvatarCard } from './AlessiaAvatarCard';
import { ALESSIA_STYLES, AlessiaStyleId } from '../../constants/companion';

interface Props {
  value: AlessiaStyleId;
  onChange: (id: AlessiaStyleId) => void;
  avatarSize?: number;
}

export function AlessiaStyleSelector({ value, onChange, avatarSize = 90 }: Props) {
  return (
    <View style={styles.grid}>
      {ALESSIA_STYLES.map((s) => (
        <Pressable key={s.id} onPress={() => onChange(s.id)} style={styles.cell}>
          <AlessiaAvatarCard
            icon={s.icon}
            label={s.label}
            size={avatarSize}
            selected={value === s.id}
          />
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  cell: {
    width: '32%',
    alignItems: 'center',
  },
});
