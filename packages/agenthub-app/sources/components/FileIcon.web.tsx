import React from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';
import { useUnistyles } from 'react-native-unistyles';

interface FileIconProps {
    fileName: string;
    size?: number;
}

type IconData = { svg: string; color: string };
type ColorTheme = Record<string, string>;

const lightColorTheme: ColorTheme = {
    blue: '#268bd2', grey: '#6b7280', 'grey-light': '#9ca3af', green: '#059669',
    orange: '#d97706', pink: '#db2777', purple: '#7c3aed', red: '#dc2626',
    white: '#374151', yellow: '#eab308', ignore: '#9ca3af',
};
const darkColorTheme: ColorTheme = {
    blue: '#268bd2', grey: '#eee', 'grey-light': '#839496', green: '#4bae4f',
    orange: '#cb4b16', pink: '#d33682', purple: '#6c71c4', red: '#dc322f',
    white: '#fdf6e3', yellow: '#ffcb29', ignore: '#586e75',
};

async function loadIcon(fileName: string, dark: boolean): Promise<IconData> {
    const { themeIcons } = await import('@peoplesgrocers/seti-ui-file-icons');
    return themeIcons((dark ? darkColorTheme : lightColorTheme) as never)(fileName);
}

export const FileIcon: React.FC<FileIconProps> = ({ fileName, size = 36 }) => {
    const { theme } = useUnistyles();
    const [icon, setIcon] = React.useState<IconData | null>(null);

    React.useEffect(() => {
        let active = true;
        setIcon(null);
        void loadIcon(fileName, theme.dark).then((nextIcon) => {
            if (active) setIcon(nextIcon);
        });
        return () => {
            active = false;
        };
    }, [fileName, theme.dark]);

    return (
        <View
            accessibilityRole="image"
            accessibilityLabel={fileName}
            style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
        >
            {icon ? (
                <SvgXml xml={icon.svg} width={size} height={size} fill={icon.color} />
            ) : (
                <View style={{
                    width: size * 0.68,
                    height: size * 0.82,
                    borderRadius: Math.max(2, size * 0.08),
                    borderWidth: Math.max(1, size * 0.055),
                    borderColor: theme.colors.divider,
                    backgroundColor: theme.colors.surface,
                }} />
            )}
        </View>
    );
};

export default FileIcon;
