import * as React from 'react';
import { useRoute } from "@react-navigation/native";
import { SessionViewRoute } from '@/-session/SessionViewRoute';


export default React.memo(() => {
    const route = useRoute();
    const sessionId = (route.params! as any).id as string;
    return (<SessionViewRoute id={sessionId} />);
});
