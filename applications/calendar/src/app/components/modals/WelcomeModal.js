import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { c } from 'ttag';
import {
    Alert,
    FormModal,
    Icon,
    Loader,
    useLoading,
    useEventManager,
    useApi,
    useAddressesKeys,
    useModals,
    useUserKeys
} from 'react-components';
import { createCalendar } from 'proton-shared/lib/api/calendars';
import calendarSvg from 'design-system/assets/img/pm-images/calendar.svg';
import betaSvg from 'design-system/assets/img/pm-images/beta.svg';
import { redirectTo } from 'proton-shared/lib/helpers/browser';
import { wait } from 'proton-shared/lib/helpers/promise';

import { setupCalendarKey } from '../../helpers/calendarModal';
import { DEFAULT_CALENDAR } from '../../constants';
import CalendarModal from './calendar/CalendarModal';

const WelcomeContent = ({ loading, isFree }) => {
    if (isFree) {
        return (
            <>
                <div className="w50 center">
                    <img src={betaSvg} alt="Beta" />
                    <p>{c('Info')
                        .t`ProtonCalendar is currently in Beta and is only available to paid users of ProtonMail.`}</p>
                </div>
                <Alert>{c('Info')
                    .t`If you only would like to participate in our Beta program today, consider upgrading to a paid plan. ProtonCalendar will be available to free users upon launch.`}</Alert>
            </>
        );
    }

    if (loading) {
        return (
            <>
                <Alert>{c('Info').t`Give us a moment while we prepare your calendar.`}</Alert>
                <div className="w50 center">
                    <Loader />
                    <p>{c('Info').t`Creating your calendar...`}</p>
                </div>
            </>
        );
    }

    const supportIcon = <Icon name="support1" />;

    return (
        <>
            <Alert>{c('Info')
                .t`Your new calendar is now ready. All events in your calendar are encrypted and inaccessible to anybody other than you.`}</Alert>
            <div className="w50 center">
                <img src={calendarSvg} alt="Calendar" />
            </div>
            <Alert>{c('Info')
                .jt`If you encounter a problem, you can reach our support team by clicking the ${supportIcon} button.`}</Alert>
        </>
    );
};

WelcomeContent.propTypes = {
    loading: PropTypes.bool,
    isFree: PropTypes.bool
};

const WelcomeModal = ({ user, addresses, ...rest }) => {
    const { isFree, isPaid } = user;
    const [calendar, setCalendar] = useState();
    const { createModal } = useModals();
    const { call } = useEventManager();
    const api = useApi();
    const [userKeysList] = useUserKeys(user);
    const [addressesKeysMap, loadingAddressKeys] = useAddressesKeys(user, addresses, userKeysList);
    const [loading, withLoading] = useLoading();
    const title = loading ? c('Title').t`Preparing your calendar` : c('Title').t`Welcome to ProtonCalendar!`;
    const handleStart = () => rest.onClose();

    const handleCustomize = () => {
        rest.onClose();
        createModal(<CalendarModal calendar={calendar} />);
    };

    const setup = async () => {
        const [{ ID: addressID, Email: email = '' }] = addresses;
        const { Calendar = {} } = await api(
            createCalendar({
                AddressID: addressID,
                Name: DEFAULT_CALENDAR.name,
                Color: DEFAULT_CALENDAR.color,
                Description: DEFAULT_CALENDAR.description,
                Display: 1
            })
        );

        await setupCalendarKey({
            api,
            addressID,
            addressKeys: addressesKeysMap[addressID],
            calendarID: Calendar.ID,
            email
        });

        await call();
        setCalendar(Calendar);
    };

    useEffect(() => {
        if (isFree) {
            return () => {
                redirectTo('/inbox');
            };
        }
    }, []);

    useEffect(() => {
        if (isPaid && !loadingAddressKeys && addressesKeysMap) {
            withLoading(Promise.all([setup(), wait(2000)])); // We are waiting intentionaly 2 seconds to let the user see the loading state
        }
    }, [addresses, addressesKeysMap]);

    return (
        <FormModal
            loading={loading || loadingAddressKeys}
            title={title}
            hasClose={false}
            close={c('Action').t`Customize calendar`}
            submit={isPaid ? c('Action').t`Continue` : c('Action').t`Back to ProtonMail`}
            onSubmit={handleStart}
            onClose={handleCustomize}
            {...rest}
        >
            <WelcomeContent isFree={isFree} loading={loading || loadingAddressKeys} />
        </FormModal>
    );
};

WelcomeModal.propTypes = {
    addresses: PropTypes.array,
    user: PropTypes.object
};

export default WelcomeModal;
