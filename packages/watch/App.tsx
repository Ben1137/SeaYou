import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';
import { getWeatherDescription } from '@seame/core';

export default function App() {
  const testDescription = getWeatherDescription(0);

  return (
    <View style={styles.container}>
      <Text>SeaYou Watch App</Text>
      <Text>Core Test: {testDescription}</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
