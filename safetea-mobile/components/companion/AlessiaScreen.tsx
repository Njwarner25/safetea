import { ReactNode } from 'react';
import { SafeAreaView, ScrollView, View, StyleSheet, StatusBar } from 'react-native';
import { AlessiaColors } from '../../constants/companion';

interface Props {
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: any;
}

export function AlessiaScreen({ children, scroll = true, contentStyle }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={AlessiaColors.bg} />
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, contentStyle]}
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[styles.content, contentStyle]}>{children}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: AlessiaColors.bg },
  scroll: { flex: 1 },
  content: {
    padding: 20,
    paddingBottom: 40,
    gap: 20,
  },
});
