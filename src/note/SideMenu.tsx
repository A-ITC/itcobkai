import React, { useContext } from "react";
import { NoteDetail } from "./Note";

import timezone from "dayjs/plugin/timezone";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import "dayjs/locale/ja"
import PersonInfo from "../common/Person";
import { Context } from "../common/Context";
dayjs.extend(timezone);
dayjs.extend(utc);
dayjs.locale('ja');


// ノート画面のサイドメニュー
// 親コンポーネント: note.Note
interface SideMenuProps {
    detail?: NoteDetail
}
export default function SideMenu(props: SideMenuProps) {
    const utime = props.detail?.info.updated_at
    const { state } = useContext(Context)

    return (
        <div className="note__side">
            {props.detail && <PersonInfo profile={state.profiles[props.detail.user_id]} />}
            <div>更新日</div>
            <hr className="note-side__hr" />
            <span>{utime && dayjs(utime * 1000).tz("Asia/Tokyo").format('YYYY/MM/DD, HH:mm')}</span>
            <br />
            <br />
            <div>閲覧可能</div>
            <hr className="note-side__hr" />
            <span>全てのユーザ</span>
            <br />
            <br />
            <div>編集可能</div>
            <hr className="note-side__hr" />
            <span>本人</span>
            <br />
            <br />
            <div>目次</div>
            <hr className="note-side__hr" />
            <Index detail={props.detail} />
        </div>
    )
}


// 目次を作成
function Index(props: { detail?: NoteDetail }) {
    let codeFlag = false;

    const dom = props.detail?.content
        .split("\n")
        .map((x, i) => {
            if (x.match("^```")) codeFlag = !codeFlag;
            if (!x.match("^#")) return;
            if (codeFlag) return;
            const num = x.match("^#+\ ");
            if (!num) return
            return (
                <div key={i}
                    className="note-side__index"
                    style={{ paddingLeft: `${10 * (num![0].length - 2)}px` }}>
                    {x.replace(/^#+\ /, "")}
                </div>
            )
        })

    return (<div>{dom}</div>)
}