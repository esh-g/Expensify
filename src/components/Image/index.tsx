import React, {useEffect, useMemo} from 'react';
import {Image as RNImage} from 'react-native';
import {withOnyx} from 'react-native-onyx';
import useNetwork from '@hooks/useNetwork';
import ONYXKEYS from '@src/ONYXKEYS';
import type {ImageOnyxProps, ImageOwnProps, ImageProps} from './types';

function Image({source: propsSource, isAuthTokenRequired = false, onLoad, session, ...forwardedProps}: ImageProps) {
    const {isOffline} = useNetwork();

    /**
     * Check if the image source is a URL - if so the `encryptedAuthToken` is appended
     * to the source.
     */
    const source = useMemo(() => {
        const authToken = session?.encryptedAuthToken ?? null;
        if (isAuthTokenRequired && typeof propsSource === 'object' && 'uri' in propsSource && authToken) {
            // There is currently a `react-native-web` bug preventing the authToken being passed
            // in the headers of the image request so the authToken is added as a query param.
            // On native the authToken IS passed in the image request headers
            return {uri: `${propsSource?.uri}?encryptedAuthToken=${encodeURIComponent(authToken)}`};
        }
        return propsSource;
        // The session prop is not required, as it causes the image to reload whenever the session changes. For more information, please refer to issue #26034.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [propsSource, isAuthTokenRequired]);

    /**
     * The natural image dimensions are retrieved using the updated source
     * and as a result the `onLoad` event needs to be manually invoked to return these dimensions
     */
    useEffect(() => {
        // If an onLoad callback was specified then manually call it and pass
        // the natural image dimensions to match the native API
        if (onLoad == null) {
            return;
        }

        if (typeof source === 'object' && 'uri' in source && source.uri) {
            RNImage.getSize(source.uri, (width, height) => {
                onLoad({nativeEvent: {width, height}});
            });
        }
    }, [onLoad, source, isOffline]);

    return (
        <RNImage
            // eslint-disable-next-line react/jsx-props-no-spreading
            {...forwardedProps}
            source={source}
        />
    );
}

function imagePropsAreEqual(prevProps: ImageOwnProps, nextProps: ImageOwnProps) {
    return prevProps.source === nextProps.source;
}

const ImageWithOnyx = React.memo(
    withOnyx<ImageProps, ImageOnyxProps>({
        session: {
            key: ONYXKEYS.SESSION,
        },
    })(Image),
    imagePropsAreEqual,
);

ImageWithOnyx.displayName = 'Image';

export default ImageWithOnyx;
