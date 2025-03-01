import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TextInputProps,
  ViewStyle,
  TextInputFocusEventData,
  NativeSyntheticEvent,
  TouchableOpacityProps,
  Modal,
  TouchableOpacity,
  Alert,
  ToastAndroid,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Shadow } from 'react-native-shadow-2';
import { useMutation, useQuery, useQueryClient } from 'react-query';
import styled from 'styled-components/native';

import CardConv from '../modules/CardConv';
import { RootStackParams } from '../../App';
import CardView from '../components/Card';
import { addCard, updateCard } from '../data/cards';
import { Card } from '../types';
import { useTranslation } from 'react-i18next';
import NfcManager, {NfcTech} from 'react-native-nfc-manager';
import { encode, decode } from '../data/KeyManager';

type TextFieldProps = TextInputProps & {
  title: string;
  containerStyle?: ViewStyle;
};

import { useEffect } from 'react';

const generateRandomCardNumber = () => {
  const getRandom4Byte = () => {
    return Math.trunc(Math.random() * 65536)
      .toString(16)
      .toUpperCase()
      .padStart(4, '0');
  };

  return `02FE${getRandom4Byte()}${getRandom4Byte()}${getRandom4Byte()}`;
};

const Container = styled.KeyboardAvoidingView`
  flex: 1;
  background-color: ${props => props.theme.colors.background};
`;

const FieldTitle = styled(Text)<{ focused: boolean }>`
  font-size: 14px;
  font-weight: bold;
  color: ${props =>
    props.focused
      ? props.theme.colors.primary
      : props.theme.colors.placeholder};
`;

const FieldBottomBorder = styled.View<{ focused: boolean }>`
  padding-top: 2px;
  background-color: ${props =>
    props.focused
      ? props.theme.colors.primary
      : props.theme.colors.placeholder};
  height: ${props => (props.focused ? 2 : 1)}px;
`;

const StyledTextInput = styled.TextInput`
  font-size: 16px;
  padding-top: 4px;
  color: ${props =>
    props.editable !== false
      ? props.theme.colors.text
      : props.theme.colors.disabled};
`;

const ButtonContainer = styled.TouchableOpacity`
  height: 48px;
  background-color: ${props => props.theme.colors.primary};
  justify-content: center;
  align-items: center;
`;

const ButtonText = styled.Text`
  font-size: 16px;
  color: ${props => props.theme.colors.white};
`;

type ButtonProps = {
  text: string;
  containerStyle: ViewStyle;
} & TouchableOpacityProps;

const Button = (props: ButtonProps) => {
  const { text, containerStyle, ...touchableProps } = props;

  return (
    <Shadow
      style={styles.buttonShadowStyle}
      containerStyle={containerStyle}
      distance={4}
    >
      {/* shadow가 정상적으로 적용되지 않는 버그가 있어서 borderRadius 스타일을 분리 */}
      <ButtonContainer {...touchableProps} style={styles.buttonBorderRadius}>
        <ButtonText>{text}</ButtonText>
      </ButtonContainer>
    </Shadow>
  );
};

const TextField = (props: TextFieldProps) => {
  const { onFocus, onBlur, title, containerStyle, ...textInputProps } = props;

  const [isFocused, setIsFocused] = useState<boolean>(false);
  const onFocusCallback = useCallback(
    (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
      setIsFocused(true);
      onFocus?.(event);
    },
    [onFocus],
  );

  const onBlurCallback = useCallback(
    (event: NativeSyntheticEvent<TextInputFocusEventData>) => {
      setIsFocused(false);
      onBlur?.(event);
    },
    [onBlur],
  );

  return (
    <View style={containerStyle}>
      <FieldTitle focused={isFocused}>{title}</FieldTitle>
      <StyledTextInput
        onFocus={onFocusCallback}
        onBlur={onBlurCallback}
        {...textInputProps}
      />
      <FieldBottomBorder focused={isFocused} />
    </View>
  );
};

type CardAddScreenProps = NativeStackScreenProps<RootStackParams, 'Add'>;
type CardEditScreenProps = NativeStackScreenProps<RootStackParams, 'Edit'>;

const CardEditScreen = (props: CardAddScreenProps | CardEditScreenProps) => {
  const { t } = useTranslation();
  const initialData = props.route.params?.card ?? undefined;
  const [scanModalVisible, setScanModalVisible] = useState(false);

  async function readCard() {
    try {
      // register for the NFC tag with NDEF in it
      await NfcManager.requestTechnology(NfcTech.NfcF);
      // the resolved tag object will contain `ndefMessage` property
      const tag = await NfcManager.getTag();
      const ICTag = encode(tag.id);
      console.log('Card Read: ' + ICTag);
      setScanModalVisible(false);
      ToastAndroid.show('Tag Scanned Successfuuly: ' + ICTag, ToastAndroid.SHORT);
    } catch (ex) {
      console.warn('Oops!', ex);
    }
  }

  useEffect(() => {
    if (scanModalVisible) {
      console.log('init nfc scan');
      NfcManager.start();
      readCard();
    }
    if (!scanModalVisible) {
      console.log('stop nfc scan');
      NfcManager.cancelTechnologyRequest();
    }
  }, [scanModalVisible]);

  const [mode] = useState<'add' | 'edit'>(() => {
    return initialData ? 'edit' : 'add';
  });

  const [cardName, setCardName] = useState<string>(initialData?.name ?? 'eAM');
  const [cardNumber, setCardNumber] = useState<string>(() => {
    return initialData?.sid ?? generateRandomCardNumber();
  });
  const uid = useQuery(['uid', cardNumber], () =>
    CardConv.convertSID(cardNumber),
  );

  const styledUid = useMemo(() => {
    if (!uid.isSuccess) {
      return t('card_edit.loading_card_number');
    }

    return (
      uid.data.match(/[A-Za-z0-9]{4}/g)?.join(' - ') ??
      t('card_edit.invalid_card_number')
    );
  }, [t, uid]);

  const onChangeCardName = useCallback((s: string) => {
    setCardName(s);
  }, []);

  const changeCardNumber = useCallback(() => {
    setCardNumber(generateRandomCardNumber());
  }, []);

  const queryClient = useQueryClient();
  const addMutation = useMutation(
    (card: Card) => {
      return addCard(card);
    },
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries('cards');
        props.navigation.goBack();
      },
    },
  );
  const editMutation = useMutation(
    ({ index, card }: { index: number; card: Card }) => {
      return updateCard(index, card);
    },
    {
      onSuccess: async () => {
        await queryClient.invalidateQueries('cards');
        props.navigation.goBack();
      },
    },
  );

  const save = useCallback(() => {
    const card = {
      sid: cardNumber,
      name: cardName,
    };

    if (mode === 'add') {
      addMutation.mutate(card);
    } else {
      editMutation.mutate({ index: props.route.params!.index, card: card });
    }
  }, [
    addMutation,
    cardName,
    cardNumber,
    editMutation,
    mode,
    props.route.params,
  ]);

  return (
    <Container>
      <ScrollView
        contentContainerStyle={styles.scrollView}
        keyboardShouldPersistTaps="handled"
      >
        <CardView
          card={{
            sid: cardNumber,
            name: cardName,
          }}
          mainText={t('card_edit.card_preview')}
          index={0 /* dummy index */}
          disabledMainButton={true}
          hideBottomMenu={true}
        />

        <View style={[styles.fieldItemContainer]}>
          <TextField
            title={t('card_edit.card_name')}
            value={cardName}
            onChangeText={onChangeCardName}
          />
        </View>

        <View style={styles.fieldItemContainer}>
          <TextField
            title={t('card_edit.card_number')}
            value={styledUid}
            editable={false}
          />
          <Button
            containerStyle={styles.cardNumberChangeButton}
            onPress={changeCardNumber}
            disabled={!uid.isSuccess}
            text={t('card_edit.change_card_number')}
          />
        </View>

        <Button
          onPress={save}
          containerStyle={styles.genericButtons}
          text={t('card_edit.save')}
        />

        <Button
          onPress={() => setScanModalVisible(true)}
          containerStyle={styles.genericButtons}
          text={t('card_edit.scan')}
        />

        {/*modals*/}
        <Modal
          animationType='fade'
          transparent={true}
          visible={scanModalVisible}
          onRequestClose={() => setScanModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text>{t('card_edit.trigger_scan')}</Text>
              <TouchableOpacity onPress={() => {setScanModalVisible(false) }} style={styles.closeButton}>
                <Text>{t('card_edit.scan_close')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
        
      </ScrollView>
    </Container>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollView: {
    padding: 16,
  },
  fieldItemContainer: {
    paddingTop: 32,
  },
  buttonShadowStyle: {
    width: '100%',
  },
  buttonBorderRadius: {
    borderRadius: 8,
  },
  genericButtons: {
    marginTop: 32,
  },
  cardNumberChangeButton: {
    marginTop: 16,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  modalContent: {
    width: 300,
    padding: 20,
    backgroundColor: 'grey',
    borderRadius: 10,
    alignItems: 'center',
  },
  modalButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#28a745',
    borderRadius: 5,
  },
  closeButton: {
    marginTop: 10,
    padding: 10,
    backgroundColor: '#dc3545',
    borderRadius: 5,
  },
});

export default CardEditScreen;
